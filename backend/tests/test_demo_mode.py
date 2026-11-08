"""
Unit and Integration Tests for Demo Mode (1-Click Visitor Login):
1. When DEMO_MODE=true:
   - POST /auth/demo-login works for all 4 roles (admin, creator, reviewer, agency).
   - Missing demo users are auto-created gracefully.
   - GET /config/public returns {"demo_mode": true}.
2. When DEMO_MODE=false:
   - POST /auth/demo-login returns 404 Not Found.
   - GET /config/public returns {"demo_mode": false}.
3. Role Guard Enforcement with Demo Tokens:
   - Admin demo token allows creating a fact version (HTTP 201 Created).
   - Creator demo token is strictly rejected with HTTP 403 Forbidden on the same endpoint.
"""

import pytest
from datetime import datetime
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings, IST
from app.models.auth import User, UserRole
from app.routers.auth import demo_login, get_public_config
from app.schemas.auth import DemoLoginRequest
from app.auth.guards import get_current_user, require_roles
from app.routers.facts import create_fact_version
from app.schemas.facts import FactVersionCreate


def test_public_config_endpoint(monkeypatch):
    """GET /config/public reflects settings.demo_mode_enabled correctly."""
    monkeypatch.setattr(settings, "DEMO_MODE", "true")
    res_true = get_public_config()
    assert res_true.demo_mode is True

    monkeypatch.setattr(settings, "DEMO_MODE", "false")
    res_false = get_public_config()
    assert res_false.demo_mode is False


def test_demo_login_works_for_all_four_roles(db_session, monkeypatch):
    """POST /auth/demo-login returns valid signed JWT for admin, creator, reviewer, agency."""
    db = db_session
    monkeypatch.setattr(settings, "DEMO_MODE", "true")

    roles = [
        ("admin", "Admin", "usr_admin_elena"),
        ("creator", "Creator", "usr_creator_marcus"),
        ("reviewer", "Reviewer", "usr_reviewer_devin"),
        ("agency", "Agency", "usr_agency_partner"),
    ]

    for role_param, expected_role_name, expected_user_id in roles:
        req = DemoLoginRequest(role=role_param)
        res = demo_login(payload=req, db=db)
        assert res.access_token is not None
        assert len(res.access_token) > 20
        assert res.token_type == "bearer"
        assert res.user.role == expected_role_name
        assert res.user.id == expected_user_id

        # Verify JWT resolves through production auth guard
        resolved_user = get_current_user(
            authorization=f"Bearer {res.access_token}",
            x_user_role=None,
            x_user_id=None,
            db=db
        )
        assert resolved_user.role.value == expected_role_name
        if expected_role_name == "Agency":
            assert resolved_user.assigned_campaign_id == "camp_festive_launch"

    # Default payload (no role specified) defaults to Admin
    res_default = demo_login(payload=None, db=db)
    assert res_default.user.role == "Admin"


def test_demo_login_returns_404_when_demo_mode_false(db_session, monkeypatch):
    """When DEMO_MODE is not true, POST /auth/demo-login returns 404."""
    db = db_session
    monkeypatch.setattr(settings, "DEMO_MODE", "false")

    with pytest.raises(HTTPException) as exc:
        demo_login(payload=DemoLoginRequest(role="admin"), db=db)
    assert exc.value.status_code == 404


def test_admin_demo_token_can_create_fact_version(db_session, monkeypatch):
    """Admin demo token grants authority to create new fact versions."""
    db = db_session
    monkeypatch.setattr(settings, "DEMO_MODE", "true")

    # 1. Obtain Admin demo token
    admin_login = demo_login(payload=DemoLoginRequest(role="admin"), db=db)
    admin_token = admin_login.access_token

    # 2. Resolve admin user through guard
    admin_user = get_current_user(
        authorization=f"Bearer {admin_token}",
        x_user_role=None,
        x_user_id=None,
        db=db
    )
    admin_guard_user = require_roles([UserRole.ADMIN])(admin_user)
    assert admin_guard_user.role == UserRole.ADMIN

    # 3. Create fact version F001 with ₹5,499
    payload = FactVersionCreate(
        value="₹5,499",
        unit="INR",
        valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
        valid_to=None,
        source_id="src_price_list_dec",
        source_page=3,
        reason="Annual price revision for Festive Q4"
    )

    res = create_fact_version(
        fact_id="F001",
        payload=payload,
        db=db,
        current_user=admin_guard_user
    )
    assert res.get("new_value") == "₹5,499"
    assert res.get("new_version_no") == 2


def test_creator_demo_token_gets_403_on_fact_version_creation(db_session, monkeypatch):
    """Creator demo token is strictly rejected with 403 on Admin-only fact creation."""
    db = db_session
    monkeypatch.setattr(settings, "DEMO_MODE", "true")

    # 1. Obtain Creator demo token
    creator_login = demo_login(payload=DemoLoginRequest(role="creator"), db=db)
    creator_token = creator_login.access_token

    # 2. Resolve creator user through guard
    creator_user = get_current_user(
        authorization=f"Bearer {creator_token}",
        x_user_role=None,
        x_user_id=None,
        db=db
    )
    assert creator_user.role == UserRole.CREATOR

    # 3. Guard check must raise 403 Forbidden
    with pytest.raises(HTTPException) as exc:
        require_roles([UserRole.ADMIN])(creator_user)
    assert exc.value.status_code == 403
    assert "not permitted" in exc.value.detail.lower()


def test_auto_create_missing_demo_user(db_session, monkeypatch):
    """If a demo user was deleted or is missing, demo-login recreates it gracefully."""
    db = db_session
    monkeypatch.setattr(settings, "DEMO_MODE", "true")

    # Change admin's role to Creator so no Admin exists
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    if admin:
        admin.role = UserRole.CREATOR
        admin.email = "old_admin@aura-audio.com"
        db.commit()

    # Verify no Admin user currently exists
    assert db.query(User).filter(User.role == UserRole.ADMIN).first() is None

    # demo-login for admin must auto-create the missing Admin user instead of throwing an error
    res = demo_login(payload=DemoLoginRequest(role="admin"), db=db)
    assert res.access_token is not None
    assert res.user.role == "Admin"
    assert res.user.name == "Elena Vance"


