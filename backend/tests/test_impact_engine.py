"""
Phase 1 exit test + Phase 3 exit test:
F001 v1 -> v2 impact engine: exactly 2 re-opened, 1 stale, 1 red alert, 1 left alone.
"""
import pytest
from datetime import datetime
from app.config import IST
from app.models.auth import User, UserRole
from app.models.facts import FactVersion
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ClaimFactLink, Finding
from app.models.governance import Notification
from app.models.audit import AuditLog
from app.services.impact_engine import ImpactEngine, ensure_ist


def test_phase1_f001_v1_created(db_session):
    """Phase 1 exit test: F001 v1 exists with normalised_value=4999."""
    db = db_session
    v1 = db.query(FactVersion).filter(
        FactVersion.fact_id == "F001", FactVersion.version_no == 1
    ).first()
    assert v1 is not None, "F001 v1 must exist after seed"
    assert v1.normalised_value == "4999"
    assert v1.status == "approved"
    # valid_from: 1 Sep 2026 00:00 IST
    vf = ensure_ist(v1.valid_from)
    assert vf.year == 2026 and vf.month == 9 and vf.day == 1
    assert vf.hour == 0 and vf.minute == 0


def test_phase1_f001_v2_effective_midnight_ist(db_session):
    """
    Phase 1 exit test: creating v2 (Rs 5,499) effective 1 Dec 2026 IST.
    Verifies IST midnight = UTC 2026-11-30 18:30:00.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()

    # Create v2 effective 1 Dec 2026 00:00 IST
    effective_ist = datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST)

    result = ImpactEngine.execute_fact_change(
        db=db,
        fact_id="F001",
        new_value="Rs 5,499",
        unit="INR",
        valid_from=effective_ist,
        valid_to=None,
        source_id="src_price_list_sep",
        source_page=3,
        actor=admin,
        reason="Phase 1 exit test: price revision Dec 2026",
    )
    db.commit()

    v2 = db.query(FactVersion).filter(
        FactVersion.fact_id == "F001", FactVersion.version_no == 2
    ).first()
    assert v2 is not None
    assert v2.normalised_value == "5499"

    # IST midnight stored as UTC (should be 18:30 previous day UTC)
    from datetime import timezone
    utc = v2.valid_from.astimezone(timezone.utc)
    assert utc.year == 2026 and utc.month == 11 and utc.day == 30
    assert utc.hour == 18 and utc.minute == 30


def test_phase3_five_item_impact_exact(db_session):
    """
    Phase 3 exit test — EXACT outcome:
    2 re-opened | 1 stale | 1 red alert | 1 left alone
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    effective_date = datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST)

    result = ImpactEngine.execute_fact_change(
        db=db,
        fact_id="F001",
        new_value="Rs 5,499",
        unit="INR",
        valid_from=effective_date,
        valid_to=None,
        source_id="src_price_list_sep",
        source_page=3,
        actor=admin,
        reason="Festive revision to Rs 5,499",
    )
    db.commit()

    s = result["summary"]
    print(f"\n--- Phase 3 exit test: {s}")
    assert s["re_review"] == 2,  f"Expected 2 re-opened, got {s['re_review']}"
    assert s["stale"]     == 1,  f"Expected 1 stale, got {s['stale']}"
    assert s["red_alert"] == 1,  f"Expected 1 red alert, got {s['red_alert']}"
    assert s["left_alone"] == 1, f"Expected 1 left alone, got {s['left_alone']}"
    assert s["total"]     == 5,  f"Expected 5 total, got {s['total']}"

    # LinkedIn: approved -> re-review required, approval invalidated
    cv_li = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_linkedin_launch").first()
    assert cv_li.state == "re-review required"
    assert cv_li.approved_at is None  # invalidated

    # Email: approved -> re-review required
    cv_em = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_email_festive").first()
    assert cv_em.state == "re-review required"
    assert cv_em.approved_at is None

    # Instagram: draft -> stale
    cv_ig = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_insta_poster").first()
    assert cv_ig.is_stale is True

    # Brochure: live -> red alert, NEVER auto-edited
    cv_br = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_brochure_pdf").first()
    assert cv_br.state == "live"  # must NOT be unpublished
    assert cv_br.is_red_alert is True
    red_finding = db.query(Finding).filter(
        Finding.content_version_id == cv_br.version_id,
        Finding.risk_tier == "Critical"
    ).first()
    assert red_finding is not None, "Critical finding must exist for live brochure"

    # Webinar: archived before 1 Dec -> left alone, zero findings
    cv_wb = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_webinar_post").first()
    assert cv_wb.state == "archived"
    assert cv_wb.is_stale is False
    assert cv_wb.is_red_alert is False
    webinar_findings = db.query(Finding).filter(Finding.content_version_id == cv_wb.version_id).all()
    assert len(webinar_findings) == 0, "Archived-before-effective must have zero findings"

    # v2 created, v1 superseded
    v2 = db.query(FactVersion).filter(FactVersion.fact_id == "F001", FactVersion.version_no == 2).first()
    assert v2 is not None and v2.status == "approved"
    v1 = db.query(FactVersion).filter(FactVersion.fact_id == "F001", FactVersion.version_no == 1).first()
    assert v1.status == "superseded"
    assert ensure_ist(v1.valid_to) == effective_date

    # Audit log entry created
    audit = db.query(AuditLog).filter(
        AuditLog.action == "VERSION_CHANGE", AuditLog.entity_id == v2.version_id
    ).first()
    assert audit is not None
