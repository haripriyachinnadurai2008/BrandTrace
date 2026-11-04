import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

DATABASE_URL = os.getenv("DATABASE_URL", settings.DATABASE_URL)

# SQLite (tests) needs different pool args than PostgreSQL (production)
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
        connect_args={"client_encoding": "utf8"},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def apply_audit_triggers(connection):
    """
    Append-only triggers for audit_logs (UPDATE + DELETE blocked).
    Supports PostgreSQL (plpgsql function) and SQLite (BEFORE triggers).
    """
    if connection.dialect.name == "sqlite":
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE prohibited');
            END;
        """))
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE prohibited');
            END;
        """))
        return

    connection.execute(text("""
        CREATE OR REPLACE FUNCTION fn_audit_logs_block_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is strictly append-only: % operations are prohibited', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
    """))
    connection.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_block_update') THEN
                CREATE TRIGGER trg_audit_logs_block_update
                BEFORE UPDATE ON audit_logs
                FOR EACH ROW
                EXECUTE FUNCTION fn_audit_logs_block_mutation();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_block_delete') THEN
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
