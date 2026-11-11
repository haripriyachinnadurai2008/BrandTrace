"""
Phase 1 regression tests:
1. Idempotent seeding (never drops/deletes user-created precedents, audit logs, facts).
2. Explicit reset=True works when requested.
3. Groq API timeout/error deterministic fallback & ai_unavailable metadata + label.
4. All 4 seeded accounts tested end-to-end via real JWT tokens across key endpoints.
"""
from datetime import datetime
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import IST, settings
from app.database import get_db
from app.main import app
from app.auth.jwt import hash_password
from app.models.auth import User, UserRole
from app.models.facts import BrandFact
from app.models.content import ContentItem, ContentVersion
from app.models.governance import Precedent
from app.models.audit import AuditLog
from app.services.llm_client import call_llm_with_meta, _deterministic_fallback
from app.services.checker import run_check
from seed.seed_data import seed_database


def test_seed_idempotent_preserves_user_records(tmp_path):
    """Running seed_database(reset=False) twice must keep user-created rows intact."""
    db_file = tmp_path / "idempotent_seed.db"
    eng = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _rec):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    try:
        res1 = seed_database(target_engine=eng, reset=False)
        assert res1["users"] == 4
        assert res1["precedents"] >= 2
        assert res1["audit_logs"] >= 1

        Session = sessionmaker(bind=eng)
        with Session() as db:
            db.add(BrandFact(
                id="F_USER_CUSTOM",
                org_id="org_aura_audio",
                name="Custom Warranty Fact",
                category="Policy",
                created_at=datetime.now(IST),
            ))
            db.add(Precedent(
                id="prec_user_custom",
                org_id="org_aura_audio",
                rule_id="RULE_CUSTOM_01",
                decision_reason="Approved seasonal exception by Reviewer",
                approved_by="usr_reviewer_devin",
                created_at=datetime.now(IST),
            ))
            db.add(AuditLog(
                id="aud_user_custom",
                entity_type="precedent",
                entity_id="prec_user_custom",
                action="DISMISS",
                actor_id="usr_reviewer_devin",
                actor_role="Reviewer",
                new_values={"custom": True},
                reason="Custom audit trail entry",
                created_at=datetime.now(IST),
            ))
            db.commit()

        # Re-run non-destructive seed
        seed_database(target_engine=eng, reset=False)

        with Session() as db:
            assert db.query(User).count() == 4
            assert db.query(BrandFact).filter(BrandFact.id == "F_USER_CUSTOM").first() is not None
            assert db.query(Precedent).filter(Precedent.id == "prec_user_custom").first() is not None
            assert db.query(AuditLog).filter(AuditLog.id == "aud_user_custom").first() is not None
            assert db.query(Precedent).count() == res1["precedents"] + 1
            assert db.query(AuditLog).count() == res1["audit_logs"] + 1

        # Explicit reset=True rebuilds clean demo dataset
        seed_database(target_engine=eng, reset=True)
        with Session() as db:
            assert db.query(Precedent).filter(Precedent.id == "prec_user_custom").first() is None
            assert db.query(AuditLog).filter(AuditLog.id == "aud_user_custom").first() is None
            assert db.query(User).count() == 4
            assert db.query(Precedent).count() == 2
    finally:
        eng.dispose()


def test_deterministic_fallback_pct_precedence_bug_fixed():
    """Substring 'off' in 'offer' must not trigger a phantom [PCT_1] claim."""
    claims = _deterministic_fallback("Limited time offer from Aura Audio with satisfaction guarantee.")
    pct_claims = [c for c in claims if c["type"] == "percentage"]
    assert pct_claims == []
    assert any(c["type"] == "claim" and c["attribute"] == "guarantee" for c in claims)


def test_groq_timeout_falls_back_gracefully_with_meta(db_session, monkeypatch):
    """When Groq fails/times out, call_llm_with_meta and run_check return fallback claims & badge."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test_simulated_timeout")

    def _raise_timeout(*args, **kwargs):
        raise httpx.TimeoutException("Simulated Groq timeout")

    monkeypatch.setattr(httpx, "post", _raise_timeout)

    meta = call_llm_with_meta(
        "Unseen promo headline: Aura X1 Pro now at [PRICE_1] with [PCT_1] off until [DATE_1]."
    )
    assert meta["ai_unavailable"] is True
    assert meta["source"] == "fallback"
    assert len(meta["claims"]) >= 3

    # Run full checker pipeline on a fresh uncached content item
    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    custom_ci = ContentItem(
        id="ci_groq_timeout_test",
        org_id="org_aura_audio",
        campaign_id="camp_festive_launch",
        title="Uncached Flash Promo",
        channel="Social",
        current_state="draft",
        owner_id=admin.id,
        created_at=datetime.now(IST),
    )
    custom_cv = ContentVersion(
        version_id="cv_groq_timeout_1",
        content_id="ci_groq_timeout_test",
        version_no=1,
        raw_text="Unique uncached blurb: Get Aura Audio X1 Pro for ₹5,999 with 10% off till 30 Nov 2026.",
        version_hash="hash_unique_uncached_999",
        state="draft",
        created_at=datetime.now(IST),
    )
    db_session.add_all([custom_ci, custom_cv])
    db_session.commit()

    result = run_check(
        db=db_session,
        content_id="ci_groq_timeout_test",
        actor_id=admin.id,
        actor_role=admin.role.value,
    )
    assert result["ai_unavailable"] is True
    assert result["extraction_source"] == "fallback"
    assert result["ai_label"] == "AI unavailable, using cached/deterministic result"
    assert result["findings_count"] >= 1


def test_all_four_seeded_accounts_jwt_rbac_matrix(db_session):
    """Every seeded account authenticates with real JWT and sees strict per-role responses."""
    pwd_hash = hash_password("BrandTrace2026!")
    for u in db_session.query(User).all():
        u.password_hash = pwd_hash
        if u.role == UserRole.AGENCY and not u.assigned_campaign_id:
            u.assigned_campaign_id = "camp_festive_launch"
    db_session.commit()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app)
    try:
        expected = {
            "admin@aura-audio.com": {
                "role": "Admin",
                "audit": 200,
                "coherence": 200,
                "precedents": 200,
            },
            "creator@aura-audio.com": {
                "role": "Creator",
                "audit": 403,
                "coherence": 200,
                "precedents": 200,
            },
            "reviewer@aura-audio.com": {
                "role": "Reviewer",
                "audit": 200,
                "coherence": 200,
                "precedents": 200,
            },
            "agency@partner.com": {
                "role": "Agency",
                "audit": 403,
                "coherence": 403,
                "precedents": 200,
            },
        }

        for email, cfg in expected.items():
            login_resp = client.post("/auth/login", json={"email": email, "password": "BrandTrace2026!"})
            assert login_resp.status_code == 200, f"Login failed for {email}: {login_resp.text}"
            body = login_resp.json()
            assert body["user"]["role"] == cfg["role"]
            token = body["access_token"]

            # Intentionally pass conflicting X-User-Role: Admin to verify JWT takes precedence
            headers = {
                "Authorization": f"Bearer {token}",
                "X-User-Role": "Admin",
            }

            assert client.get("/content", headers=headers).status_code == 200
            assert client.get("/facts", headers=headers).status_code == 200
            assert client.get("/campaigns", headers=headers).status_code == 200
            assert client.get("/precedents", headers=headers).status_code == cfg["precedents"]
            assert client.get("/audit", headers=headers).status_code == cfg["audit"]
            assert (
                client.post("/campaigns/camp_festive_launch/check-coherence", headers=headers).status_code
                == cfg["coherence"]
            )
    finally:
        app.dependency_overrides.clear()

