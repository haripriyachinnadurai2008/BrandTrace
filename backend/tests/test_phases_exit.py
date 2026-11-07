"""
Phase 2, Phase 4, Phase 5, Phase 6 Exit Tests.

PHASE 2:
  Post 'Meet the X1 Pro, now just Rs 4,999... Guaranteed 100% satisfaction. Offer ends 31 Dec.'
  yields Critical Contradicted (price vs F001 v2) and Medium Unverified (guarantee).

PHASE 4:
  Campaign Coherence Lite:
  Email says 20% off, poster says 25% off -> High finding 'Cross-channel contradiction'.

PHASE 5:
  Living Guidelines Lite:
  Reviewer dismisses/overrides finding with reason -> row created in precedents table.

PHASE 6:
  Editorial Approval Gate:
  POST /content/{id}/approve rejected (HTTP 422) if open Critical findings exist.
  Agency role blocked from mutating endpoints (HTTP 403).
"""

import pytest
from datetime import datetime
from fastapi import HTTPException

from app.config import IST
from app.models.auth import User, UserRole
from app.models.facts import FactVersion
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, Finding
from app.models.governance import Precedent
from app.services.impact_engine import ImpactEngine
from app.services.checker import run_check
from app.services.coherence import check_campaign_coherence
from app.routers.content import approve_content
from app.routers.findings import dismiss_finding, DismissRequest
from app.schemas.content import ApproveRequest


def test_phase2_exit_test_extraction_and_verification(db_session):
    """
    Phase 2 Exit Test:
    Text: 'Meet the X1 Pro, now just Rs 4,999. Guaranteed 100% satisfaction. Offer ends 31 Dec.'
    Must yield:
      1. Critical Contradicted for price (Rs 4,999 vs F001 v2 which is Rs 5,499)
      2. Medium Unverified for guarantee (no matching fact)
      3. Derived content_status == 'Needs human review'
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    creator = db.query(User).filter(User.role == UserRole.CREATOR).first()

    # 1. Update F001 to v2: Rs 5,499
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
        reason="Update F001 to v2 for Phase 2 exit test"
    )
    db.commit()

    # 2. Create content item with the exact test copy
    test_text = "Meet the X1 Pro, now just Rs 4,999. Guaranteed 100% satisfaction. Offer ends 31 Dec."
    ci = ContentItem(
        id="ci_phase2_exit",
        org_id="org_aura_audio",
        campaign_id="camp_festive_launch",
        title="Phase 2 Exit Test Post",
        channel="social",
        current_state="draft",
        owner_id=creator.id,
        created_at=datetime.now(IST)
    )
    db.add(ci)
    db.flush()

    cv = ContentVersion(
        version_id="cv_phase2_exit_v1",
        content_id=ci.id,
        version_no=1,
        raw_text=test_text,
        version_hash="test_hash_p2",
        state="draft",
        created_at=datetime.now(IST)
    )
    db.add(cv)
    db.commit()

    # 3. Run check
    report = run_check(
        db=db,
        content_id=ci.id,
        actor_id=creator.id,
        actor_role=creator.role.value
    )

    findings = report["findings"]
    assert len(findings) >= 2, f"Expected at least 2 findings, got {len(findings)}"

    # 4. Check for Critical Contradicted price finding
    price_findings = [
        f for f in findings
        if f["status"] == "Contradicted" and f["risk_tier"] == "Critical"
    ]
    assert len(price_findings) == 1, (
        f"Expected 1 Critical Contradicted finding for price, found: {price_findings}"
    )
    pf = price_findings[0]
    assert "4999" in pf["raw_span_text"] or "4,999" in pf["raw_span_text"]
    assert pf["extraction_confidence"] > 0.8
    assert pf["source_reference"] is not None
    assert pf["fix_options"] is not None
    assert "Rs 5,499" in pf["fix_options"]["minimal"] or "5,499" in pf["fix_options"]["minimal"]

    # 5. Check for Medium Unverified guarantee finding
    guarantee_findings = [
        f for f in findings
        if f["status"] == "Unverified" and f["risk_tier"] == "Medium"
    ]
    assert len(guarantee_findings) >= 1, (
        f"Expected at least 1 Medium Unverified finding for guarantee, found: {guarantee_findings}"
    )
    gf = guarantee_findings[0]
    assert "satisfaction" in gf["excerpt"].lower() or "guarantee" in gf["reason"].lower() or "guarantee" in gf["raw_span_text"].lower()

    # 6. Overall derived status must be "Needs human review"
    assert report["content_status"] == "Needs human review"
    print("\n--- PHASE 2 EXIT TEST PASSED ---")
    print(f"Price finding: [{pf['risk_tier']}] {pf['status']} - {pf['reason']}")
    print(f"Guarantee finding: [{gf['risk_tier']}] {gf['status']} - {gf['reason']}")
    print(f"Content status: {report['content_status']}")


def test_phase4_campaign_coherence_lite(db_session):
    """
    Phase 4 Exit Test:
    Seeded Campaign 'Festive Launch' has:
      - Email: 20% off
      - Instagram Poster: 25% off
    check_campaign_coherence must flag this as High 'Cross-channel contradiction'.
    """
    db = db_session
    
    # Run coherence check
    findings = check_campaign_coherence(db, "camp_festive_launch")
    db.commit()

    assert len(findings) >= 2, f"Expected cross-channel findings for conflicting items, got {len(findings)}"
    
    # Verify High tier and reason
    for f in findings:
        assert f["risk_tier"] == "High"
        assert "Cross-channel contradiction" in f["reason"]
        assert "discount" in f["attribute"]
    
    values_seen = set(f["this_value"] for f in findings)
    assert "20%" in values_seen
    assert "25%" in values_seen
    print("\n--- PHASE 4 EXIT TEST PASSED ---")
    print(f"Found {len(findings)} cross-channel contradiction findings between 20% and 25% discounts.")


def test_phase5_living_guidelines_precedent_logging(db_session):
    """
    Phase 5 Exit Test:
    Reviewer overrides/dismisses a finding with a mandatory reason.
    Asserts a row is created in precedents table with rule_id, finding_id, reviewer, reason, timestamp.
    """
    db = db_session
    reviewer = db.query(User).filter(User.role == UserRole.REVIEWER).first()
    creator = db.query(User).filter(User.role == UserRole.CREATOR).first()

    # Create a dummy finding
    cv = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_insta_poster").first()
    claim = db.query(ExtractedClaim).filter(ExtractedClaim.content_version_id == cv.version_id).first()

    finding = Finding(
        id="f_phase5_test",
        content_version_id=cv.version_id,
        claim_id=claim.id,
        risk_tier="Medium",
        reason="Unverified festive claim",
        source_reference="Content submission",
        extraction_confidence=0.9,
        status="open",
        created_at=datetime.now(IST)
    )
    db.add(finding)
    db.commit()

    # Reviewer dismisses with valid reason
    req = DismissRequest(
        reason="Approved festive special exception by marketing director",
        resolution_action="dismissed"
    )
    res = dismiss_finding(
        finding_id=finding.id,
        payload=req,
        db=db,
        current_user=reviewer
    )

    assert res["status"] == "success"
    assert res["precedent_id"] is not None

    # Verify precedent in DB
    prec = db.query(Precedent).filter(Precedent.id == res["precedent_id"]).first()
    assert prec is not None
    assert prec.reviewer_id == reviewer.id
    assert prec.reason == "Approved festive special exception by marketing director"
    assert prec.resolution_action == "dismissed"
    assert prec.timestamp is not None
    print("\n--- PHASE 5 EXIT TEST PASSED ---")
    print(f"Precedent logged with id {prec.id}, reviewer {prec.reviewer_id}, reason: '{prec.reason}'")


def test_phase6_approval_gate_blocked_by_open_critical(db_session):
    """
    Phase 6 Exit Test:
    POST /content/{id}/approve must be strictly blocked (HTTP 422)
    when an open Critical finding exists.
    """
    db = db_session
    reviewer = db.query(User).filter(User.role == UserRole.REVIEWER).first()
    cv = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_insta_poster").first()
    claim = db.query(ExtractedClaim).filter(ExtractedClaim.content_version_id == cv.version_id).first()

    # Add open Critical finding
    critical_finding = Finding(
        id="f_critical_gate_test",
        content_version_id=cv.version_id,
        claim_id=claim.id,
        risk_tier="Critical",
        reason="Active price discrepancy vs approved catalog",
        source_reference="Catalog Q4 p.1",
        extraction_confidence=0.99,
        status="open",
        created_at=datetime.now(IST)
    )
    db.add(critical_finding)
    db.commit()

    # Attempt approve -> should raise 422
    with pytest.raises(HTTPException) as exc:
        approve_content(
            content_id="ci_insta_poster",
            payload=ApproveRequest(reason="Editorial approval test"),
            db=db,
            current_user=reviewer
        )
    assert exc.value.status_code == 422
    assert "blocking" in str(exc.value.detail).lower()

    # Resolve/dismiss the critical finding
    critical_finding.status = "dismissed"
    db.commit()

    # Now approve should succeed!
    approve_res = approve_content(
        content_id="ci_insta_poster",
        payload=ApproveRequest(reason="Reviewed and approved"),
        db=db,
        current_user=reviewer
    )
    assert approve_res["status"] == "approved"
    assert approve_res["state"] == "approved"

    # Restore ci_insta_poster to draft state so shared database is not left dirty
    ci_insta = db.query(ContentItem).filter(ContentItem.id == "ci_insta_poster").first()
    cv_insta = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_insta_poster").first()
    if ci_insta:
        ci_insta.current_state = "draft"
    if cv_insta:
        cv_insta.state = "draft"
        cv_insta.approved_at = None
    db.commit()

    print("\n--- PHASE 6 EXIT TEST PASSED ---")
    print("Open Critical finding successfully blocked approval with 422; approved after resolution.")

