"""
conftest.py — pytest fixtures for BrandTrace unit tests.

Creates a SQLite in-memory engine per test, bypassing the production
PostgreSQL DATABASE_URL.  All models are created fresh for every test
function, seed data is inserted, and the session is closed on teardown.

pg_trgm similarity falls back gracefully in matcher.py when unavailable.
SQLite BEFORE-triggers replicate the PostgreSQL audit-log guards.
"""
import os
import pytest
from datetime import datetime
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

# ── Override env BEFORE any app module loads the engine ──────────────────────
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:?check_same_thread=False")

from app.config import IST          # noqa: E402
from app.database import Base       # noqa: E402
import app.models                   # noqa: E402  registers all ORM mappers


# ── Pytest report header hook (prints DB dialect and host at startup) ─────────
def pytest_report_header(config):
    db_url = os.environ.get("DATABASE_URL", "sqlite:///:memory:?check_same_thread=False")
    if "postgresql" in db_url or "postgres" in db_url:
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 5432
        db_name = parsed.path.lstrip("/") or "brandtrace_db"
        dialect = "postgresql (pg_trgm enabled)"
        db_info = f"dialect={dialect} | host={host}:{port}/{db_name}"
    else:
        dialect = "sqlite"
        db_info = f"dialect={dialect} | host=in-memory (:memory:)"

    return [
        "=" * 70,
        f"BrandTrace DB Backend: {db_info}",
        "=" * 70,
    ]


# ── Engine fixture ────────────────────────────────────────────────────────────
@pytest.fixture(scope="function")
def db_engine():
    db_url = os.environ.get("DATABASE_URL", "sqlite:///:memory:?check_same_thread=False")
    if "sqlite" in db_url:
        engine = create_engine(
            "sqlite:///:memory:?check_same_thread=False",
            connect_args={"check_same_thread": False},
        )
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _rec):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(bind=engine)
        _apply_sqlite_audit_triggers(engine)
        yield engine
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
    else:
        # Real PostgreSQL with native plpgsql triggers and pg_trgm
        engine = create_engine(db_url, connect_args={"client_encoding": "utf8"})
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        with engine.begin() as conn:
            from app.database import apply_audit_triggers
            apply_audit_triggers(conn)
        yield engine
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


# ── Session fixture ───────────────────────────────────────────────────────────
@pytest.fixture(scope="function")
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    _seed(session)
    yield session
    session.rollback()
    session.close()


# ── SQLite audit triggers (mirror the PostgreSQL BEFORE triggers) ────────────
def _apply_sqlite_audit_triggers(engine):
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT,
                    'audit_logs is strictly append-only: UPDATE operations are prohibited');
            END;
        """))
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_block_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT,
                    'audit_logs is strictly append-only: DELETE operations are prohibited');
            END;
        """))
        conn.commit()


# ── Seed helper ───────────────────────────────────────────────────────────────
def _seed(db):
    """
    Insert the full 5-piece seeded demo dataset into the test session.
    Mirrors seed_data.py but uses the test session, not the production engine.
    """
    import hashlib
    from app.models.auth import Organization, User, UserRole
    from app.models.facts import EvidenceSource, BrandFact, FactVersion
    from app.models.campaign import Campaign, CampaignFact
    from app.models.content import ContentItem, ContentVersion
    from app.models.claims import ExtractedClaim, ClaimFactLink
    from app.models.audit import AuditLog

    def h(t): return hashlib.sha256(t.encode()).hexdigest()
    t0 = datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)

    org = Organization(id="org_aura_audio", name="Aura Audio Technologies", created_at=t0)
    db.add(org)

    admin    = User(id="usr_admin_elena",    org_id="org_aura_audio", name="Elena Vance",
                    email="admin@aura-audio.com",    role=UserRole.ADMIN,    created_at=t0)
    creator  = User(id="usr_creator_marcus", org_id="org_aura_audio", name="Marcus Brody",
                    email="creator@aura-audio.com",  role=UserRole.CREATOR,  created_at=t0)
    reviewer = User(id="usr_reviewer_devin", org_id="org_aura_audio", name="Devin Chen",
                    email="reviewer@aura-audio.com", role=UserRole.REVIEWER, created_at=t0)
    agency   = User(id="usr_agency_partner", org_id="org_aura_audio", name="Partner Agency",
                    email="agency@partner.com",      role=UserRole.AGENCY,   created_at=t0)
    db.add_all([admin, creator, reviewer, agency])

    source = EvidenceSource(
        id="src_price_list_sep", org_id="org_aura_audio",
        title="Price List Sep", file_name="Price_List_Sep.pdf", file_type="pdf",
        excerpt="X1 Pro: Rs 4,999", created_at=datetime(2026, 8, 25, 10, 0, 0, tzinfo=IST))
    db.add(source)

    fact = BrandFact(id="F001", org_id="org_aura_audio", name="X1 Pro price",
                     category="Pricing", created_at=datetime(2026, 8, 25, 10, 30, 0, tzinfo=IST))
    db.add(fact)

    # F001 v1 — valid_to set so it looks "superseded" in archive test
    v1 = FactVersion(
        version_id="fv_f001_v1", fact_id="F001", version_no=1,
        value="Rs 4,999", unit="INR", normalised_value="4999",
        valid_from=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST),
        valid_to=datetime(2026, 11, 30, 23, 59, 59, tzinfo=IST),
        status="approved",
        approved_by="usr_admin_elena", approved_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST),
        source_id="src_price_list_sep", source_page=2,
        created_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST))
    db.add(v1)

    campaign = Campaign(
        id="camp_festive_launch", org_id="org_aura_audio", name="Festive Launch",
        description="Q4 Festive Launch", approved_offer="20% off launch discount",
        status="active", created_at=datetime(2026, 8, 30, 9, 0, 0, tzinfo=IST))
    db.add(campaign)
    db.add(CampaignFact(id="cf_festive_f001", campaign_id="camp_festive_launch",
                        fact_version_id="fv_f001_v1",
                        created_at=datetime(2026, 8, 30, 9, 0, 0, tzinfo=IST)))

    # 5 content pieces — (id, title, channel, state, text, pub_at, appr_at, arch_at, url)
    pieces = [
        ("ci_linkedin_launch", "LinkedIn Launch Post",    "linkedin",  "approved",
         "Experience sound. X1 Pro at Rs 4,999.",
         None,
         datetime(2026, 10, 15, 10, 0, 0, tzinfo=IST), None, None),

        ("ci_email_festive",   "Festive Email Campaign",  "email",     "approved",
         "Get X1 Pro for Rs 4,999 with 20% off!",
         None,
         datetime(2026, 10, 20, 14, 0, 0, tzinfo=IST), None, None),

        ("ci_insta_poster",    "Instagram Poster Caption","instagram", "draft",
         "X1 Pro Rs 4,999 with 25% off this weekend!",
         None, None, None, None),

        ("ci_brochure_pdf",    "Product Brochure PDF",    "brochure",  "live",
         "Retail Price: Rs 4,999 incl. GST.",
         datetime(2026, 9, 10, 9, 0, 0, tzinfo=IST),
         datetime(2026, 9, 9, 10, 0, 0, tzinfo=IST),
         None, "https://aura-audio.com/brochures/x1-pro.pdf"),

        ("ci_webinar_post",    "Q3 Launch Webinar Post",  "webinar",   "archived",
         "X1 Pro early bird Rs 4,999. Recording archived.",
         datetime(2026, 9, 5, 11, 0, 0, tzinfo=IST),
         datetime(2026, 9, 5, 10, 30, 0, tzinfo=IST),
         datetime(2026, 10, 31, 18, 0, 0, tzinfo=IST),   # archived BEFORE 1 Dec!
         "https://aura-audio.com/webinars/q3"),
    ]

    for ci_id, title, channel, state, text_body, pub_at, appr_at, arch_at, pub_url in pieces:
        ci = ContentItem(
            id=ci_id, org_id="org_aura_audio", campaign_id="camp_festive_launch",
            title=title, channel=channel, current_state=state,
            owner_id="usr_creator_marcus",
            created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST))
        db.add(ci)

        cv_id = f"cv_{ci_id.replace('ci_', '')}_v1"
        cv = ContentVersion(
            version_id=cv_id, content_id=ci_id, version_no=1,
            raw_text=text_body, version_hash=h(text_body),
            state=state, published_at=pub_at, approved_at=appr_at,
            archived_at=arch_at, publish_url=pub_url,
            created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST))
        db.add(cv)

        span = text_body.find("Rs 4,999")
        span = max(span, 0)
        claim_id = f"claim_{ci_id.replace('ci_', '')}_1"
        claim = ExtractedClaim(
            id=claim_id, content_version_id=cv_id,
            raw_span_text="Rs 4,999", normalised_value="4999",
            value_type="price", is_approximate=False,
            subject="X1 Pro price", attribute="price",
            span_start=span, span_end=span + 8,
            extraction_confidence=0.98, masked_token="[PRICE_1]",
            created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST))
        db.add(claim)

        link = ClaimFactLink(
            id=f"link_{ci_id.replace('ci_', '')}_1",
            claim_id=claim_id, fact_version_id="fv_f001_v1",
            similarity_score=1.0, link_type="auto", status="verified",
            created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST))
        db.add(link)

        # Seed promotional offer claims for Phase 4 Coherence
        if ci_id == "ci_email_festive":
            off_span = text_body.find("20% off")
            db.add(ExtractedClaim(
                id="claim_email_2", content_version_id=cv_id,
                raw_span_text="20% off", normalised_value="20%",
                value_type="percentage", is_approximate=False,
                subject="Festive Launch offer", attribute="discount",
                span_start=off_span, span_end=off_span + 7,
                extraction_confidence=0.97, masked_token="[PCT_1]",
                created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST)))
        elif ci_id == "ci_insta_poster":
            off_span = text_body.find("25% off")
            db.add(ExtractedClaim(
                id="claim_insta_2", content_version_id=cv_id,
                raw_span_text="25% off", normalised_value="25%",
                value_type="percentage", is_approximate=False,
                subject="Festive Launch offer", attribute="discount",
                span_start=off_span, span_end=off_span + 7,
                extraction_confidence=0.96, masked_token="[PCT_1]",
                created_at=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST)))

    db.add(AuditLog(
        id="audit_initial_seed", entity_type="brand_fact", entity_id="F001",
        action="CREATE", actor_id="usr_admin_elena", actor_role="Admin",
        reason="Initial seed", created_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST)))

    db.commit()
