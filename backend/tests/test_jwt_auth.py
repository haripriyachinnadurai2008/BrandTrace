"""
Unit and Integration Tests for JWT Authentication & Production Auth Guard:
1. POST /auth/login with valid seeded user credentials returns JWT bearer token.
2. Invalid password returns 401 Unauthorized.
3. Protected endpoints accept Authorization: Bearer <token>.
4. When ENVIRONMENT=production, unauthenticated requests WITHOUT Bearer token are strictly rejected with 401,
   and role-switcher headers (X-User-Role / X-User-Id) are IGNORED.
"""

import pytest
from fastapi import HTTPException
from app.models.auth import User, UserRole
from app.routers.auth import login
from app.schemas.auth import LoginRequest
from app.auth.guards import get_current_user
from app.config import settings


def test_login_success_all_four_roles(db_session):
    """Confirm all 4 seeded users can log in with BrandTrace2026!"""
    db = db_session
    roles_and_emails = [
        ("Admin", "admin@aura-audio.com"),
        ("Creator", "creator@aura-audio.com"),
        ("Reviewer", "reviewer@aura-audio.com"),
        ("Agency", "agency@partner.com"),
    ]

    for role_name, email in roles_and_emails:
        req = LoginRequest(email=email, password="BrandTrace2026!")
        res = login(payload=req, db=db)
        assert res.access_token is not None
        assert len(res.access_token) > 20
        assert res.user.role == role_name


def test_login_invalid_password_fails(db_session):
    """Incorrect password raises 401 Unauthorized."""
    db = db_session
    req = LoginRequest(email="admin@aura-audio.com", password="WrongPassword123")
    with pytest.raises(HTTPException) as exc:
        login(payload=req, db=db)
    assert exc.value.status_code == 401
    assert "incorrect password" in exc.value.detail.lower()


def test_bearer_token_authenticates_user(db_session):
    """Bearer token correctly resolves to the authenticated user."""
    db = db_session
    req = LoginRequest(email="reviewer@aura-audio.com", password="BrandTrace2026!")
    res = login(payload=req, db=db)
    token = res.access_token

    # Pass Authorization header to get_current_user
    user = get_current_user(
        authorization=f"Bearer {token}",
        x_user_role=None,
        x_user_id=None,
        db=db
    )
    assert user.role == UserRole.REVIEWER
    assert user.email == "reviewer@aura-audio.com"


def test_production_environment_rejects_unauthenticated_and_ignores_role_switcher(db_session, monkeypatch):
    """
    When ENVIRONMENT=production:
    - Requests without Bearer token must raise 401 UNAUTHORIZED.
    - X-User-Role / X-User-Id headers are strictly IGNORED.
    """
    db = db_session
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_ROLE_SWITCHER", "false")

    # 1. Calling without Bearer token must be rejected with 401
    with pytest.raises(HTTPException) as exc:
        get_current_user(
            authorization=None,
            x_user_role="Admin",  # Attempting to spoof Admin via role switcher
            x_user_id="usr_admin_elena",
            db=db
        )
    assert exc.value.status_code == 401
    assert "role switcher is disabled in production" in exc.value.detail.lower()

    # 2. Providing valid Bearer token STILL works in production!
    req = LoginRequest(email="creator@aura-audio.com", password="BrandTrace2026!")
    token_res = login(payload=req, db=db)

    user = get_current_user(
        authorization=f"Bearer {token_res.access_token}",
        x_user_role=None,
        x_user_id=None,
        db=db
    )
    assert user.role == UserRole.CREATOR

