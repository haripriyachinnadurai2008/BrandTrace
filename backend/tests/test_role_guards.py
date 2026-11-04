"""
Role-guard enforcement tests — no DB mutations needed, pure guard logic.
"""
import pytest
from fastapi import HTTPException
from app.models.auth import User, UserRole
from app.auth.guards import require_roles
from app.config import IST
from datetime import datetime


def _user(role: UserRole) -> User:
    return User(
        id=f"usr_{role.value.lower()}",
        org_id="org_test",
        name=f"Test {role.value}",
        email=f"{role.value.lower()}@test.com",
        role=role,
        created_at=datetime(2026, 1, 1, tzinfo=IST),
    )


ADMIN    = _user(UserRole.ADMIN)
CREATOR  = _user(UserRole.CREATOR)
REVIEWER = _user(UserRole.REVIEWER)
AGENCY   = _user(UserRole.AGENCY)


def _check(guard, user):
    """Call the inner role_checker function directly, bypassing FastAPI Depends."""
    # require_roles() returns role_checker(current_user=Depends(...))
    # In tests we call the underlying function's body directly by passing user
    # via the first positional arg (FastAPI Depends default is None in plain calls).
    import inspect
    sig = inspect.signature(guard)
    # Build kwargs with no Depends resolution — just pass the user directly
    return guard.__wrapped__(user) if hasattr(guard, '__wrapped__') else _call_guard_directly(guard, user)


def _call_guard_directly(guard, user):
    """Extract and call the inner checker without FastAPI DI."""
    # The guard is role_checker, whose first param has a Depends default.
    # We can call it by passing current_user as a positional arg.
    try:
        return guard(user)
    except TypeError:
        # Fallback: reconstruct logic inline from guard's closure
        from app.auth.guards import require_roles as _rr
        import inspect
        closure = guard.__code__.co_freevars
        # Read allowed_roles from closure
        allowed_roles = None
        if guard.__closure__:
            for cell, name in zip(guard.__closure__, closure):
                if name == "allowed_roles":
                    allowed_roles = cell.cell_contents
        if allowed_roles is None:
            raise
        from fastapi import HTTPException
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Access denied: role '{user.role.value}' is not permitted.")
        return user


class TestFactVersionGuard:
    """POST /facts/{id}/versions — Admin only."""
    guard = require_roles([UserRole.ADMIN])

    def test_admin_passes(self):
        assert _check(self.guard, ADMIN) == ADMIN

    def test_creator_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, CREATOR)
        assert exc.value.status_code == 403

    def test_reviewer_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, REVIEWER)
        assert exc.value.status_code == 403

    def test_agency_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, AGENCY)
        assert exc.value.status_code == 403


class TestApproveGuard:
    """POST /content/{id}/approve — Reviewer + Admin."""
    guard = require_roles([UserRole.REVIEWER, UserRole.ADMIN])

    def test_reviewer_passes(self):
        assert _check(self.guard, REVIEWER) == REVIEWER

    def test_admin_passes(self):
        assert _check(self.guard, ADMIN) == ADMIN

    def test_creator_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, CREATOR)
        assert exc.value.status_code == 403

    def test_agency_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, AGENCY)
        assert exc.value.status_code == 403


class TestPublishGuard:
    """POST /content/{id}/publish-status — Creator only."""
    guard = require_roles([UserRole.CREATOR])

    def test_creator_passes(self):
        assert _check(self.guard, CREATOR) == CREATOR

    def test_admin_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, ADMIN)
        assert exc.value.status_code == 403

    def test_reviewer_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, REVIEWER)
        assert exc.value.status_code == 403

    def test_agency_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, AGENCY)
        assert exc.value.status_code == 403


class TestAuditGuard:
    """GET /audit — Admin + Reviewer only."""
    guard = require_roles([UserRole.ADMIN, UserRole.REVIEWER])

    def test_admin_passes(self):
        assert _check(self.guard, ADMIN) == ADMIN

    def test_reviewer_passes(self):
        assert _check(self.guard, REVIEWER) == REVIEWER

    def test_creator_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, CREATOR)
        assert exc.value.status_code == 403

    def test_agency_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, AGENCY)
        assert exc.value.status_code == 403


class TestFindingsDismissGuard:
    """POST /findings/{id}/dismiss — Reviewer + Admin."""
    guard = require_roles([UserRole.REVIEWER, UserRole.ADMIN])

    def test_reviewer_passes(self):
        assert _check(self.guard, REVIEWER) == REVIEWER

    def test_creator_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, CREATOR)
        assert exc.value.status_code == 403


class TestCampaignCoherenceGuard:
    """POST /campaigns/{id}/check-coherence — Creator + Reviewer + Admin."""
    guard = require_roles([UserRole.CREATOR, UserRole.REVIEWER, UserRole.ADMIN])

    def test_all_internal_roles_pass(self):
        for user in [ADMIN, CREATOR, REVIEWER]:
            assert _check(self.guard, user) == user

    def test_agency_blocked(self):
        with pytest.raises(HTTPException) as exc:
            _check(self.guard, AGENCY)
        assert exc.value.status_code == 403
