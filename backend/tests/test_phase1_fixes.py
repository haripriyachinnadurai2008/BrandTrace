"""
Phase 1 regression tests:
1. Idempotent seeding (never drops/deletes user-created precedents, audit logs, facts).
2. Startup ensure_demo_dataset_seeded() recovery when partial DB only has an auto-provisioned user.
3. Explicit reset=True works when requested.
4. Groq API timeout/error deterministic fallback & ai_unavailable metadata + label.
5. All 4 seeded accounts tested end-to-end via real JWT tokens across key endpoints/guards.
"""
from datetime import datetime
import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import IST, settings
from app.database import Base, apply_audit_triggers
from app.main import ensure_demo_dataset_seeded
from app.auth.guards import get_current_user, require_roles
from app.auth.jwt import hash_password
from app.models.auth import Organization, User, UserRole
from app.models.facts import BrandFact
from app.models.content import ContentItem, ContentVersion
from app.models.governance import Precedent
from app.models.audit import AuditLog
from app.routers import auth as auth_router
from app.routers import content as content_router
from app.routers import facts as facts_router
from app.routers import campaigns as campaigns_router
from app.routers import precedents as precedents_router
from app.routers import audit as audit_router
from app.schemas.auth import LoginRequest
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
        assert res1["content_items_total"] == 5
        assert res1["precedents_total"] >= 2
        assert res1["audit_logs_total"] >= 1

        Session = sessionmaker(bind=eng)
        with Session() as db:
            assert db.query(User).count() == 4

            db.add(BrandFact(
                id="F_USER_CUSTOM",
                org_id="org_aura_audio",
                name="Custom Warranty Fact",
                category="Policy",
                created_at=datetime.now(IST),
            ))
            db.add(Precedent(
                id="prec_user_custom",
                rule_id="R001",
                finding_id=None,
                reviewer_id="usr_reviewer_devin",
                reason="Approved seasonal exception by Reviewer",
                finding_summary="Custom seasonal claim summary",
                resolution_action="override",
                timestamp=datetime.now(IST),
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
            assert db.query(Precedent).count() == res1["precedents_total"] + 1
            assert db.query(AuditLog).count() == res1["audit_logs_total"] + 1

        # Explicit reset=True rebuilds clean demo dataset
        seed_database(target_engine=eng, reset=True)
        with Session() as db:
            assert db.query(Precedent).filter(Precedent.id == "prec_user_custom").first() is None
            assert db.query(AuditLog).filter(AuditLog.id == "aud_user_custom").first() is None
            assert db.query(User).count() == 4
            assert db.query(Precedent).count() == 2
    finally:
        eng.dispose()


def test_ensure_demo_dataset_seeded_recovers_partial_db(tmp_path):
    """Startup hook must import cleanly and backfill partial DBs (e.g. only 1 login-created user)."""
    db_file = tmp_path / "partial_seed.db"
    eng = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    try:
        Base.metadata.create_all(bind=eng)
        with eng.begin() as conn:
            apply_audit_triggers(conn)

        Session = sessionmaker(bind=eng)
        with Session() as db:
            # Simulate an auto-provisioned Admin user created before seeding completed
            db.add(User(
                id="usr_admin_elena",
                org_id="org_aura_audio",
                name="Elena Vance",
                email="admin@aura-audio.com",
                password_hash=hash_password("BrandTrace2026!"),
                role=UserRole.ADMIN,
                created_at=datetime.now(IST),
            ))
            db.commit()

            did_seed = ensure_demo_dataset_seeded(db, eng)
            assert did_seed is True
            assert db.query(Organization).count() == 1
            assert db.query(User).count() == 4
            assert db.query(ContentItem).count() == 5
            assert db.query(BrandFact).count() >= 1
            assert db.query(Precedent).count() >= 2
            assert db.query(AuditLog).count() >= 1

            # Second check should detect complete DB and skip redundant seeding
            did_seed_again = ensure_demo_dataset_seeded(db, eng)
            assert did_seed_again is False
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
    assert result["ai_label"] == "AI unavailable, using deterministic/cached result"
    assert result["findings_count"] >= 1


def test_all_four_seeded_accounts_jwt_rbac_matrix(db_session):
    """Every seeded account authenticates with real JWT and sees strict per-role permissions."""
    pwd_hash = hash_password("BrandTrace2026!")
    for u in db_session.query(User).all():
        u.password_hash = pwd_hash
        if u.role == UserRole.AGENCY and not u.assigned_campaign_id:
            u.assigned_campaign_id = "camp_festive_launch"
    db_session.commit()

    expected = {
        "admin@aura-audio.com": {
            "role": "Admin",
            "audit_allowed": True,
            "coherence_allowed": True,
        },
        "creator@aura-audio.com": {
            "role": "Creator",
            "audit_allowed": False,
            "coherence_allowed": True,
        },
        "reviewer@aura-audio.com": {
            "role": "Reviewer",
            "audit_allowed": True,
            "coherence_allowed": True,
        },
        "agency@partner.com": {
            "role": "Agency",
            "audit_allowed": False,
            "coherence_allowed": False,
        },
    }

    audit_guard = require_roles([UserRole.ADMIN, UserRole.REVIEWER])
    coherence_guard = require_roles([UserRole.CREATOR, UserRole.REVIEWER, UserRole.ADMIN])

    for email, cfg in expected.items():
        token_resp = auth_router.login(payload=LoginRequest(email=email, password="BrandTrace2026!"), db=db_session)
        assert token_resp.user.role == cfg["role"]

        # Conflicting X-User-Role header must be ignored when Bearer JWT is present
        resolved_user = get_current_user(
            authorization=f"Bearer {token_resp.access_token}",
            x_user_role="Admin",
            x_user_id="usr_admin_elena",
            db=db_session,
        )
        assert resolved_user.role.value == cfg["role"]

        assert len(content_router.list_content(db=db_session, current_user=resolved_user)) >= 1
        assert len(facts_router.list_facts(db=db_session, current_user=resolved_user)) >= 1
        assert len(campaigns_router.list_campaigns(db=db_session, current_user=resolved_user)) >= 1
        precedents_router.list_precedents(db=db_session, current_user=resolved_user)

        if cfg["audit_allowed"]:
            audit_guard(current_user=resolved_user)
            logs = audit_router.get_audit_trail(db=db_session, current_user=resolved_user)
            assert isinstance(logs, list)
        else:
            with pytest.raises(HTTPException) as exc:
                audit_guard(current_user=resolved_user)
            assert exc.value.status_code == 403

        if cfg["coherence_allowed"]:
            coherence_guard(current_user=resolved_user)
            coh = campaigns_router.check_coherence(
                campaign_id="camp_festive_launch",
                db=db_session,
                current_user=resolved_user,
            )
            assert coh["campaign_id"] == "camp_festive_launch"
        else:
            with pytest.raises(HTTPException) as exc:
                coherence_guard(current_user=resolved_user)
            assert exc.value.status_code == 403
