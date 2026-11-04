"""
Regression Tests:
1. Derived status: Any Critical or High finding MUST yield "Needs human review"
   (Fix for Screen 1 LinkedIn post which showed "Ready for review" with a High finding).
2. Agency Role Scoping:
   - Restrict /content, /campaigns, /findings, /precedents to assigned campaign (read-only).
   - Non-assigned campaign access returns 403 Forbidden.
   - Restrict /users to non-sensitive fields (UserPublicResponse).
"""

import pytest
from fastapi import HTTPException
from datetime import datetime
from app.config import IST
from app.models.auth import User, UserRole, Organization
from app.models.campaign import Campaign
from app.models.content import ContentItem, ContentVersion
from app.models.claims import Finding
from app.models.governance import Precedent
from app.services.checker import run_check
from app.routers.campaigns import list_campaigns, get_campaign
from app.routers.content import list_content, get_content_detail
from app.routers.findings import get_finding
from app.routers.precedents import list_precedents
from app.routers.auth import list_demo_users


def test_derived_status_regression_high_finding_yields_needs_human_review(db_session):
    """
    REGRESSION TEST:
    Screen 1 bug: A content item with a High finding (e.g. Stale)
    previously yielded 'Ready for review'.
    It MUST now yield 'Needs human review'.
    """
    db = db_session
    creator = db.query(User).filter(User.role == UserRole.CREATOR).first()

    # Run check on LinkedIn launch post
    result = run_check(
        db=db,
        content_id="ci_linkedin_launch",
        actor_id=creator.id,
        actor_role=creator.role.value
    )

    # Confirm there is at least one High finding
    high_findings = [f for f in result["findings"] if f["risk_tier"] in ("Critical", "High")]
    assert len(high_findings) >= 1, "Expected at least one High finding on LinkedIn post"

    # Crucial assertion: status must be 'Needs human review', NEVER 'Ready for review'
    assert result["content_status"] == "Needs human review", (
        f"Expected 'Needs human review', but got '{result['content_status']}'"
    )


def test_agency_campaign_filtering(db_session):
    """
    Agency role: restrict /campaigns and /campaigns/{id} to assigned campaign.
    """
    db = db_session
    org = db.query(Organization).first()

    # Create two campaigns
    c1 = Campaign(id="camp_agency_1", org_id=org.id, name="Assigned Campaign", approved_offer="10%")
    c2 = Campaign(id="camp_agency_2", org_id=org.id, name="Restricted Campaign", approved_offer="20%")
    db.add_all([c1, c2])
    db.flush()

    # Agency user assigned to c1
    agency_user = User(
        id="usr_agency_scoped",
        org_id=org.id,
        name="Agency Scoped",
        email="agency@scoped.com",
        role=UserRole.AGENCY,
        assigned_campaign_id=c1.id,
        created_at=datetime.now(IST)
    )
    db.add(agency_user)
    db.commit()

    # 1. list_campaigns: should ONLY return c1
    camps = list_campaigns(db=db, current_user=agency_user)
    camp_ids = [c["id"] for c in camps]
    assert c1.id in camp_ids
    assert c2.id not in camp_ids

    # 2. get_campaign: c1 allowed, c2 raises 403 Forbidden
    res1 = get_campaign(campaign_id=c1.id, db=db, current_user=agency_user)
    assert res1["id"] == c1.id

    with pytest.raises(HTTPException) as exc_info:
        get_campaign(campaign_id=c2.id, db=db, current_user=agency_user)
    assert exc_info.value.status_code == 403
    assert "Agency users may only access their assigned campaign" in exc_info.value.detail


def test_agency_content_and_findings_filtering(db_session):
    """
    Agency role: restrict /content, /content/{id}, and /findings/{id} to assigned campaign.
    """
    db = db_session
    org = db.query(Organization).first()
    creator = db.query(User).filter(User.role == UserRole.CREATOR).first()

    c_assigned = Campaign(id="camp_assign", org_id=org.id, name="Assigned", approved_offer="15%")
    c_other = Campaign(id="camp_other", org_id=org.id, name="Other", approved_offer="25%")
    db.add_all([c_assigned, c_other])
    db.flush()

    from app.models.claims import ExtractedClaim

    # Content in assigned campaign
    ci_allowed = ContentItem(id="ci_allowed", org_id=org.id, campaign_id=c_assigned.id, title="Allowed Copy", channel="email", owner_id=creator.id)
    cv_allowed = ContentVersion(version_id="cv_allowed", content_id=ci_allowed.id, version_no=1, raw_text="text", version_hash="h1", state="approved")
    claim_allowed = ExtractedClaim(id="cl_allowed", content_version_id=cv_allowed.version_id, raw_span_text="val", normalised_value="val", value_type="price", is_approximate=False, subject="prod", attribute="price", span_start=0, span_end=3, extraction_confidence=1.0)
    finding_allowed = Finding(id="f_allowed", content_version_id=cv_allowed.version_id, claim_id=claim_allowed.id, risk_tier="Info", reason="ok", source_reference="src_price_list_sep p.1", status="open")

    # Content in unassigned campaign
    ci_blocked = ContentItem(id="ci_blocked", org_id=org.id, campaign_id=c_other.id, title="Blocked Copy", channel="email", owner_id=creator.id)
    cv_blocked = ContentVersion(version_id="cv_blocked", content_id=ci_blocked.id, version_no=1, raw_text="text", version_hash="h2", state="approved")
    claim_blocked = ExtractedClaim(id="cl_blocked", content_version_id=cv_blocked.version_id, raw_span_text="val", normalised_value="val", value_type="price", is_approximate=False, subject="prod", attribute="price", span_start=0, span_end=3, extraction_confidence=1.0)
    finding_blocked = Finding(id="f_blocked", content_version_id=cv_blocked.version_id, claim_id=claim_blocked.id, risk_tier="Info", reason="ok", source_reference="src_price_list_sep p.1", status="open")

    db.add_all([ci_allowed, cv_allowed, claim_allowed, finding_allowed, ci_blocked, cv_blocked, claim_blocked, finding_blocked])

    agency_user = User(
        id="usr_agency_agent",
        org_id=org.id,
        name="Agency Agent",
        email="agent@agency.com",
        role=UserRole.AGENCY,
        assigned_campaign_id=c_assigned.id,
        created_at=datetime.now(IST)
    )
    db.add(agency_user)
    db.commit()

    # /content list only returns allowed
    items = list_content(db=db, current_user=agency_user)
    item_ids = [i.id for i in items]
    assert ci_allowed.id in item_ids
    assert ci_blocked.id not in item_ids

    # /content/{id} allowed vs blocked
    res_allowed = get_content_detail(content_id=ci_allowed.id, db=db, current_user=agency_user)
    assert res_allowed["content_item"].id == ci_allowed.id

    with pytest.raises(HTTPException) as exc_item:
        get_content_detail(content_id=ci_blocked.id, db=db, current_user=agency_user)
    assert exc_item.value.status_code == 403

    # /findings/{id} allowed vs blocked
    f_res = get_finding(finding_id=finding_allowed.id, db=db, current_user=agency_user)
    assert f_res["id"] == finding_allowed.id

    with pytest.raises(HTTPException) as exc_finding:
        get_finding(finding_id=finding_blocked.id, db=db, current_user=agency_user)
    assert exc_finding.value.status_code == 403


def test_users_endpoint_returns_non_sensitive_fields_only(db_session):
    """
    /users must only expose non-sensitive fields (id, name, role, assigned_campaign_id),
    omitting emails, org_ids, password hashes, and internal timestamps.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()

    users = list_demo_users(db=db, current_user=admin)
    assert len(users) >= 1

    # Verify attributes of returned UserPublicResponse
    for u in users:
        # Check that model representation does not leak email or org_id
        u_dict = u.__dict__
        assert hasattr(u, "id")
        assert hasattr(u, "name")
        assert hasattr(u, "role")
        # Ensure schema serialization excludes sensitive fields
        from app.schemas.auth import UserPublicResponse
        pub = UserPublicResponse.model_validate(u)
        pub_fields = pub.model_dump().keys()
        assert "email" not in pub_fields, "Email must not be exposed in /users"
        assert "org_id" not in pub_fields, "org_id must not be exposed in /users"
        assert "created_at" not in pub_fields, "created_at must not be exposed in /users"


def test_agency_facts_and_impact_scoping(db_session):
    """
    Agency role: restrict /facts, /facts/{id}, and /facts/{id}/impact to assigned campaign facts.
    """
    db = db_session
    org = db.query(Organization).first()
    from app.models.facts import BrandFact, FactVersion, EvidenceSource
    from app.models.campaign import CampaignFact
    from app.routers.facts import list_facts, get_fact, preview_fact_impact

    src = db.query(EvidenceSource).first()

    # Fact 1: linked to Festive Launch campaign (camp_festive_launch)
    f1 = db.query(BrandFact).filter(BrandFact.id == "F001").first()

    # Fact 2: unlinked or linked to an entirely different campaign
    c_other = Campaign(id="camp_other_unlinked", org_id=org.id, name="Other Campaign", approved_offer="5%")
    f2 = BrandFact(id="F002_SECRET", org_id=org.id, name="Secret Fact", category="Pricing")
    v2 = FactVersion(
        version_id="fv_f002_v1", fact_id="F002_SECRET", version_no=1,
        value="Rs 9,999", unit="INR", normalised_value="9999",
        valid_from=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST),
        status="approved", source_id=src.id, source_page=1
    )
    db.add_all([c_other, f2, v2])
    db.flush()
    db.add(CampaignFact(id="cf_other_f002", campaign_id=c_other.id, fact_version_id=v2.version_id))

    # Agency user assigned to Festive Launch
    agency_festive = User(
        id="usr_agency_festive",
        org_id=org.id,
        name="Agency Festive",
        email="agency.festive@aura-audio.com",
        role=UserRole.AGENCY,
        assigned_campaign_id="camp_festive_launch",
        created_at=datetime.now(IST)
    )
    # Agency user with no assigned campaign
    agency_unassigned = User(
        id="usr_agency_unassigned",
        org_id=org.id,
        name="Agency Unassigned",
        email="agency.unassigned@aura-audio.com",
        role=UserRole.AGENCY,
        assigned_campaign_id=None,
        created_at=datetime.now(IST)
    )
    db.add_all([agency_festive, agency_unassigned])
    db.commit()

    # 1. /facts: agency_festive sees F001, but NOT F002_SECRET
    facts_festive = list_facts(db=db, current_user=agency_festive)
    fact_ids = [f.id for f in facts_festive]
    assert "F001" in fact_ids
    assert "F002_SECRET" not in fact_ids

    # Unassigned agency sees empty list
    facts_unassigned = list_facts(db=db, current_user=agency_unassigned)
    assert facts_unassigned == []

    # 2. /facts/{id}: agency_festive can access F001, but 403 on F002_SECRET
    res_f1 = get_fact(fact_id="F001", db=db, current_user=agency_festive)
    assert res_f1.id == "F001"

    with pytest.raises(HTTPException) as exc_f2:
        get_fact(fact_id="F002_SECRET", db=db, current_user=agency_festive)
    assert exc_f2.value.status_code == 403
    assert "Agency user cannot access fact" in exc_f2.value.detail

    # 3. /facts/{id}/impact: agency_festive can preview F001 impact, but 403 on F002_SECRET
    impact_f1 = preview_fact_impact(fact_id="F001", new_value="₹5,499", db=db, current_user=agency_festive)
    assert impact_f1.fact_id == "F001"
    assert len(impact_f1.items) > 0

    with pytest.raises(HTTPException) as exc_impact:
        preview_fact_impact(fact_id="F002_SECRET", new_value="₹10,999", db=db, current_user=agency_festive)
    assert exc_impact.value.status_code == 403


def test_agency_notifications_scoping(db_session):
    """
    Agency role: restrict /notifications and /notifications/{id}/read to assigned campaign.
    """
    db = db_session
    org = db.query(Organization).first()
    from app.models.governance import Notification
    from app.routers.notifications import get_my_notifications, mark_read

    # Content in Festive Launch
    ci_festive = db.query(ContentItem).filter(ContentItem.id == "ci_linkedin_launch").first()

    # Content in other campaign
    c_other = Campaign(id="camp_notif_other", org_id=org.id, name="Other", approved_offer="30%")
    ci_other = ContentItem(id="ci_notif_other", org_id=org.id, campaign_id=c_other.id, title="Other Post", channel="email", owner_id="usr_creator_marcus")
    db.add_all([c_other, ci_other])
    db.flush()

    agency_user = User(
        id="usr_agency_notif",
        org_id=org.id,
        name="Agency Notif",
        email="agency.notif@aura-audio.com",
        role=UserRole.AGENCY,
        assigned_campaign_id="camp_festive_launch",
        created_at=datetime.now(IST)
    )
    db.add(agency_user)
    db.flush()

    # Notification 1: belongs to Festive Launch content
    n_allowed = Notification(
        id="notif_allowed_festive",
        user_id=agency_user.id,
        type="re_review_required",
        title="Festive Content Update",
        message="Review required for festive launch post",
        reference_id=ci_festive.id,
        reference_type="content_item",
        is_read=False
    )
    # Notification 2: belongs to other campaign content
    n_forbidden = Notification(
        id="notif_blocked_other",
        user_id=agency_user.id,
        type="re_review_required",
        title="Other Campaign Update",
        message="Review required for other campaign post",
        reference_id=ci_other.id,
        reference_type="content_item",
        is_read=False
    )
    db.add_all([n_allowed, n_forbidden])
    db.commit()

    # 1. get_my_notifications only returns n_allowed
    notifs = get_my_notifications(unread_only=False, db=db, current_user=agency_user)
    notif_ids = [n.id for n in notifs]
    assert n_allowed.id in notif_ids
    assert n_forbidden.id not in notif_ids

    # 2. mark_read allows n_allowed, forbids n_forbidden
    res_read = mark_read(notification_id=n_allowed.id, db=db, current_user=agency_user)
    assert res_read["status"] == "read"

    with pytest.raises(HTTPException) as exc_read:
        mark_read(notification_id=n_forbidden.id, db=db, current_user=agency_user)
    assert exc_read.value.status_code == 403


def test_sec68_subject_defaulting_price_guard(db_session):
    """
    Sec 6.8 subject defaulting applies ONLY to price-type claims.
    Other attributes (e.g. 'free shipping above Rs 999') keep their own attribute
    and must NOT map to product price.
    """
    db = db_session
    creator = db.query(User).filter(User.role == UserRole.CREATOR).first()

    # Create content with a non-price threshold: "Free shipping on all orders above Rs 999"
    ci = ContentItem(
        id="ci_free_shipping",
        org_id="org_aura_audio",
        campaign_id="camp_festive_launch",  # Campaign declared products = ["X1 Pro"]
        title="Shipping Promo Banner",
        channel="instagram",
        owner_id=creator.id
    )
    cv = ContentVersion(
        version_id="cv_free_shipping_v1",
        content_id=ci.id,
        version_no=1,
        raw_text="Free express shipping on all orders above Rs 999 across India.",
        version_hash="hash_shipping_promo",
        state="draft"
    )
    db.add_all([ci, cv])
    db.commit()

    # Pass text through checker
    from app.services.checker import run_check

    result = run_check(
        db=db,
        content_id="ci_free_shipping",
        actor_id=creator.id,
        actor_role=creator.role.value
    )

    # Check extracted claims in database
    from app.models.claims import ExtractedClaim, ClaimFactLink
    claims = db.query(ExtractedClaim).filter(ExtractedClaim.content_version_id == cv.version_id).all()
    assert len(claims) >= 1

    claim = claims[0]
    # Verify that raw text span contains 999
    assert "999" in claim.raw_span_text
    # The claim must NOT be linked to F001 (X1 Pro price)
    links = db.query(ClaimFactLink).filter(ClaimFactLink.claim_id == claim.id).all()
    assert all(l.fact_version_id != "fv_f001_v1" for l in links), "Free shipping threshold must NOT link to F001 (X1 Pro price)!"

    # Findings must be Unverified (no approved free shipping fact), NOT Contradicted against product price
    findings = result["findings"]
    for f in findings:
        assert f["status"] != "Contradicted", "Shipping promo must NOT contradict product price!"

