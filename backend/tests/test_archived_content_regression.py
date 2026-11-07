import pytest
from datetime import datetime
from app.config import IST
from app.models.facts import FactVersion
from app.models.content import ContentItem, ContentVersion
from app.models.claims import Finding
from app.services.checker import run_check
from app.services.impact_engine import ImpactEngine


def test_archived_content_no_critical_or_high_finding(db_session):
    """
    FIX 1 Regression Test:
    Content archived before a new fact version's valid_from must be verified
    against the historical fact version valid at its archived_at time,
    producing NO Critical or High findings.
    It must yield risk_tier='Info', status='Verified', and reason='Valid when published, no action needed.'
    """
    db = db_session

    # 1. Admin creates F001 v2 (Rs 5,499 effective 2026-12-01 IST)
    from app.models.auth import User, UserRole
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()

    ImpactEngine.execute_fact_change(
        db=db,
        fact_id="F001",
        new_value="₹5,499",
        unit="INR",
        valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
        valid_to=None,
        source_id="src_price_list_dec",
        source_page=3,
        actor=admin,
        reason="Q4 Festive Price Revision"
    )
    db.commit()

    # 2. Verify ci_webinar_post exists and was archived on 2026-10-31 (before 2026-12-01)
    ci = db.query(ContentItem).filter(ContentItem.id == "ci_webinar_post").first()
    assert ci is not None
    assert ci.current_state == "archived"

    cv = db.query(ContentVersion).filter(ContentVersion.content_id == ci.id).first()
    assert cv is not None
    assert cv.state == "archived"
    from app.services.impact_engine import ensure_ist
    assert ensure_ist(cv.archived_at) < datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST)

    # 3. Run verification check on the archived content item
    res = run_check(
        db=db,
        content_id="ci_webinar_post",
        actor_id=admin.id,
        actor_role=admin.role.value
    )

    # 4. Assert NO Critical or High findings
    findings = res["findings"]
    critical_or_high = [f for f in findings if f["risk_tier"] in ("Critical", "High")]
    assert len(critical_or_high) == 0, f"Expected 0 Critical/High findings, got: {critical_or_high}"

    # 5. Assert the price finding is marked as Info / Verified with the specific reason
    price_findings = [f for f in findings if "4999" in f.get("reason", "") or "4999" in f.get("raw_span_text", "") or f.get("reason") == "Valid when published, no action needed."]
    assert len(price_findings) >= 1
    for pf in price_findings:
        assert pf["risk_tier"] == "Info"
        assert pf["status"] == "Verified"
        assert "Valid when published, no action needed" in pf["reason"]
        assert pf["fix_options"] is None

    assert res["content_status"] != "Needs human review"
    print("\n[TEST PASSED] Archived content produced 0 Critical/High findings, status=Verified, risk_tier=Info.")
