from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings, IST
from app.database import engine, Base, apply_audit_triggers, get_db
from app.routers import auth, facts, content, audit, campaigns, precedents
from app.routers import findings as findings_router
from app.routers import notifications as notifications_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables + audit triggers."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        apply_audit_triggers(conn)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "BrandTrace — Git for brand facts. "
        "THE LLM EXTRACTS, THE BACKEND VERIFIES, HUMANS DECIDE."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# In production CORS_ORIGINS must list the Vercel URL explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(facts.router)
app.include_router(content.router)
app.include_router(findings_router.router)
app.include_router(notifications_router.router)
app.include_router(audit.router)
app.include_router(campaigns.router)
app.include_router(precedents.router)


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    """
    Liveness probe used by Render and load balancers.
    Performs a lightweight DB round-trip to confirm connectivity.
    """
    db_status = "ok"
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = "error"
        db_error = str(exc)

    now_ist = datetime.now(IST).isoformat()
    return {
        "status": "healthy" if db_status == "ok" else "degraded",
        "service": settings.PROJECT_NAME,
        "version": "2.0.0",
        "environment": settings.ENVIRONMENT,
        "timezone": settings.TIMEZONE,
        "timestamp_ist": now_ist,
        "db": db_status,
        "db_error": db_error,
        "role_switcher_enabled": settings.role_switcher_enabled,
    }
