from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings, IST
from app.database import engine, Base, apply_audit_triggers, get_db, SessionLocal
from app.routers import auth, facts, content, audit, campaigns, precedents, sources
from app.routers import findings as findings_router
from app.routers import notifications as notifications_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify DB connectivity, create tables + audit triggers + auto-seed if empty."""
    try:
        from app.database import ensure_db_connected
        active_engine = ensure_db_connected()

        Base.metadata.create_all(bind=active_engine)
        with active_engine.begin() as conn:
            apply_audit_triggers(conn)

        # If database is fresh (e.g. SQLite fallback or new Render PostgreSQL DB),
        # auto-seed demo dataset so the prototype is immediately usable.
        try:
            from app.models.auth import User, UserRole
            from app.models.facts import BrandFact, FactVersion
            from app.models.content import ContentItem
            from app.models.campaign import CampaignFact
            from seed.seed_data import seed_database
            with SessionLocal() as db:
                user_count = db.query(User).count()
                fact_count = db.query(BrandFact).count()
                content_count = db.query(ContentItem).count()

                if user_count == 0 or fact_count == 0 or content_count == 0:
                    print(f"[BrandTrace] Incomplete database detected (users={user_count}, facts={fact_count}, content={content_count}). Auto-seeding demo dataset...")
                    seed_database(target_engine=active_engine)
                    print("[BrandTrace] Demo dataset seeded successfully.")
                else:
                    # Ensure existing demo Agency user has assigned campaign set to Festive Launch
                    agency_users = db.query(User).filter(User.role == UserRole.AGENCY).all()
                    updated = False
                    for au in agency_users:
                        if not au.assigned_campaign_id:
                            au.assigned_campaign_id = "camp_festive_launch"
                            updated = True
                    if updated:
                        db.commit()
                        print("[BrandTrace] Linked existing Agency demo user to camp_festive_launch.")

                    # Ensure CampaignFact links Festive Launch to F001 v1
                    cf_exists = db.query(CampaignFact).filter(
                        CampaignFact.campaign_id == "camp_festive_launch"
                    ).first()
                    if not cf_exists:
                        v1 = db.query(FactVersion).filter(FactVersion.fact_id == "F001").first()
                        if v1:
                            db.add(CampaignFact(
                                id="cf_festive_f001",
                                campaign_id="camp_festive_launch",
                                fact_version_id=v1.version_id,
                                notes="Standard retail launch price",
                                created_at=datetime.now(IST)
                            ))
                            db.commit()
                            print("[BrandTrace] Ensured Festive Launch linked to F001 in campaign_facts.")
        except Exception as seed_err:
            print(f"[BrandTrace] Auto-seed note: {seed_err}")

    except Exception as exc:
        print(f"[BrandTrace Startup Warning] Database initialization failed: {exc}")
        print("Uvicorn will continue serving. Verify DATABASE_URL or database network connectivity.")
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
# Whitelist frontend origins and Render static site domains.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.onrender\.com|https://.*\.vercel\.app",
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
app.include_router(sources.router)


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


@app.get("/config/public", tags=["Configuration"])
def get_public_config_root():
    """Public server configuration flags (no auth)."""
    return {"demo_mode": settings.demo_mode_enabled}


@app.post("/seed", tags=["Admin / Demo"])
def trigger_seed():
    """Seed or reseed demo dataset (Aura Audio, 4 users, F001 v1, 5 pieces)."""
    from seed.seed_data import seed_database
    res = seed_database(target_engine=engine)
    return {"status": "ok", "message": "Demo data seeded successfully", "details": res}
