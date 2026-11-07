import pytest
from app.models.auth import User, UserRole
from app.routers.precedents import list_precedents


def test_list_precedents_admin(db_session):
    """
    FIX 3 Regression Test:
    Admin calls GET /precedents and receives 200 OK with seeded precedents.
    Validates that UserRole import bug is resolved and institutional memory loads.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    assert admin is not None

    precedents = list_precedents(db=db, current_user=admin)
    assert len(precedents) >= 2

    # Check fields
    p1 = precedents[0]
    assert hasattr(p1, "id")
    assert hasattr(p1, "rule_id")
    assert hasattr(p1, "reviewer_id")
    assert hasattr(p1, "reason")
    assert hasattr(p1, "finding_summary")
    assert hasattr(p1, "resolution_action")
    assert hasattr(p1, "timestamp")

    actions = [p.resolution_action for p in precedents]
    assert "override" in actions or "accepted" in actions


def test_list_precedents_agency_scoping(db_session):
    """
    Agency user calling list_precedents must only see precedents linked to
    content items within their assigned campaign.
    """
    db = db_session
    agency = db.query(User).filter(User.role == UserRole.AGENCY).first()
    assert agency is not None

    # When agency has no assigned campaign, returns empty list
    agency.assigned_campaign_id = None
    res = list_precedents(db=db, current_user=agency)
    assert res == []

