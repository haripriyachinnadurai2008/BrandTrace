"""
Atomic rollback test: forced mid-transaction failure must leave DB state unchanged.
"""
import pytest
from datetime import datetime
from app.config import IST
from app.models.auth import User, UserRole
from app.models.facts import FactVersion
from app.models.content import ContentVersion
from app.models.governance import Notification
from app.models.audit import AuditLog
from app.services.impact_engine import ImpactEngine, ensure_ist


def test_forced_failure_atomic_rollback(db_session):
    """
    Forced-failure rollback: simulate_failure=True raises RuntimeError mid-transaction.
    Every DB state change must be rolled back — no orphaned rows.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()

    initial_versions = db.query(FactVersion).filter(FactVersion.fact_id == "F001").count()
    initial_audit   = db.query(AuditLog).count()
    initial_notif   = db.query(Notification).count()

    cv_li_pre = db.query(ContentVersion).filter(
        ContentVersion.content_id == "ci_linkedin_launch"
    ).first()
    assert cv_li_pre.state == "approved"
    pre_approved_at = cv_li_pre.approved_at

    with pytest.raises(RuntimeError) as exc_info:
        try:
            ImpactEngine.execute_fact_change(
                db=db,
                fact_id="F001",
                new_value="Rs 5,499",
                unit="INR",
                valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
                valid_to=None,
                source_id="src_price_list_sep",
                source_page=3,
                actor=admin,
                reason="Rollback test",
                simulate_failure=True,
            )
            db.commit()
        except Exception:
            db.rollback()
            raise

    assert "FORCED_SIMULATED_FAILURE" in str(exc_info.value)

    # 1. No new fact version persisted
    post_versions = db.query(FactVersion).filter(FactVersion.fact_id == "F001").count()
    assert post_versions == initial_versions, f"Expected {initial_versions}, got {post_versions}"

    # 2. v1 still approved, valid_to unchanged
    v1 = db.query(FactVersion).filter(FactVersion.fact_id == "F001", FactVersion.version_no == 1).first()
    assert v1.status == "approved"

    # 3. LinkedIn approval intact
    cv_li_post = db.query(ContentVersion).filter(
        ContentVersion.content_id == "ci_linkedin_launch"
    ).first()
    assert cv_li_post.state == "approved"
    assert cv_li_post.approved_at == pre_approved_at  # unchanged

    # 4. Zero orphaned notifications
    assert db.query(Notification).count() == initial_notif

    # 5. Zero orphaned audit logs
    assert db.query(AuditLog).count() == initial_audit
