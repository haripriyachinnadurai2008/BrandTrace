
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

DATABASE_URL = os.getenv("DATABASE_URL") or settings.DATABASE_URL

# Normalize PostgreSQL URLs for the psycopg2 driver.
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgres://", "postgresql+psycopg2://", 1
        )
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgresql://", "postgresql+psycopg2://", 1
        )

# Detect cloud deployment and an incorrectly configured localhost database.
is_cloud = (
    os.getenv("RENDER") == "true"
    or os.getenv("ENVIRONMENT") == "production"
)

is_localhost_db = any(
    host in (DATABASE_URL or "")
    for host in ("127.0.0.1", "localhost")
)

# Temporary fallback to SQLite if cloud PostgreSQL is not configured.
if is_cloud and is_localhost_db and not os.getenv("FORCE_POSTGRES_LOCAL"):
    print(
        "[BrandTrace Notice] DATABASE_URL points to localhost. "
        "Falling back to SQLite. Configure DATABASE_URL in Render "
        "to connect to your managed PostgreSQL database."
    )
    DATABASE_URL = "sqlite:///./brandtrace.db"

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing. Configure it in your environment."
    )

# Configure SQLAlchemy engine.
_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args={"client_encoding": "utf8", "connect_timeout": 3},
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def ensure_db_connected(max_retries: int = 2, retry_delay: float = 1.0):
    """
    Ensures DB connectivity at startup within a fast 5-7 second budget.
    Attempts connection with retries using a 3s connect_timeout.
    If remote PostgreSQL is unreachable or connection is refused,
    gracefully and immediately falls back to local SQLite so the
    FastAPI container starts up in under 7s and passes Render health checks.
    """
    global engine, SessionLocal, DATABASE_URL, _is_sqlite
    import time

    if _is_sqlite:
        return engine

    connected = False
    for attempt in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            connected = True
            print(f"[BrandTrace DB] Successfully connected to database on attempt {attempt}.")
            break
        except Exception as exc:
            print(f"[BrandTrace DB] Connection attempt {attempt}/{max_retries} failed ({type(exc).__name__}): {exc}")
            if attempt < max_retries:
                time.sleep(retry_delay)

    if not connected:
        print(
            "[BrandTrace DB Fallback] Remote PostgreSQL unreachable within startup budget. "
            "Immediately falling back to local SQLite 'sqlite:///./brandtrace.db' to ensure 100% service uptime."
        )
        DATABASE_URL = "sqlite:///./brandtrace.db"
        _is_sqlite = True
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
        SessionLocal.configure(bind=engine)

    return engine


def apply_audit_triggers(connection):
    """
    Append-only triggers for audit_logs.
    Prevents UPDATE and DELETE operations.
    Supports PostgreSQL and SQLite.
    """
    if connection.dialect.name == "sqlite":
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'audit_logs is append-only: UPDATE prohibited'
                );
            END;
        """))

        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'audit_logs is append-only: DELETE prohibited'
                );
            END;
        """))
        return

    connection.execute(text("""
        CREATE OR REPLACE FUNCTION fn_audit_logs_block_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION
                'audit_logs is strictly append-only: % operations are prohibited',
                TG_OP;
        END;
        $$ LANGUAGE plpgsql;
    """))

    connection.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_audit_logs_block_update'
            ) THEN
                CREATE TRIGGER trg_audit_logs_block_update
                BEFORE UPDATE ON audit_logs
                FOR EACH ROW
                EXECUTE FUNCTION fn_audit_logs_block_mutation();
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_audit_logs_block_delete'
            ) THEN
                CREATE TRIGGER trg_audit_logs_block_delete
                BEFORE DELETE ON audit_logs
                FOR EACH ROW
                EXECUTE FUNCTION fn_audit_logs_block_mutation();
            END IF;
        END $$;
    """))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
