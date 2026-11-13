"""
Tests for Agency Privacy in Change-Impact Blast Radius.
Asserts that owner_name and owner_email are redacted for Agency users,
while remaining visible for internal roles (Admin, Reviewer, Creator).
"""

from app.models.auth import User, UserRole
from app.routers.facts import preview_fact_impact


def test_agency_impact_privacy_redaction(db_session):
    """Agency users must receive redacted owner name and email in blast radius preview."""
    admin_user = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    agency_user = db_session.query(User).filter(User.role == UserRole.AGENCY).first()
    assert admin_user is not None
    assert agency_user is not None

    agency_user.assigned_campaign_id = "camp_festive_launch"
    db_session.flush()

    # 1. Admin preview retains real owner names and emails
    admin_preview = preview_fact_impact(
        fact_id="F001",
        new_value="₹5,499",
        db=db_session,
        current_user=admin_user
    )
    assert len(admin_preview.items) > 0
    first_item = admin_preview.items[0]
    assert first_item.owner_name != "[REDACTED]"
    assert "@" in first_item.owner_email

    # 2. Agency preview redacts owner name and email
    agency_preview = preview_fact_impact(
        fact_id="F001",
        new_value="₹5,499",
        db=db_session,
        current_user=agency_user
    )
    assert len(agency_preview.items) > 0
    for it in agency_preview.items:
        assert it.owner_name == "[REDACTED]"
        assert it.owner_email == "[REDACTED]"
