from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.config import settings
from app.database import get_db
from app.models.auth import User, UserRole
from app.auth.jwt import decode_access_token


def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
) -> User:
    """
    Unified Authentication Dependency:
    1. If 'Authorization: Bearer <token>' header is present, decodes JWT, verifies signature & expiry,
       and returns the authenticated user from the database.
    2. If no Bearer token:
       - In development (role_switcher_enabled=True): falls back to X-User-Role / X-User-Id headers.
       - In production (role_switcher_enabled=False): strictly raises 401 UNAUTHORIZED.
    """
    query = db.query(User)

    # 1. Bearer Token Authentication
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        payload = decode_access_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token. Please log in again."
            )
        user = query.filter(User.id == payload["sub"]).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found for provided token."
            )
        return user

    # 2. Development Role-Switcher Fallback (Disabled in Production)
    if settings.role_switcher_enabled:
        if x_user_id:
            user = query.filter(User.id == x_user_id).first()
            if user:
                return user

        if x_user_role:
            for role_enum in UserRole:
                if role_enum.value.lower() == x_user_role.strip().lower():
                    user = query.filter(User.role == role_enum).first()
                    if user:
                        return user

        # Dev convenience default: Admin user if DB seeded
        admin_user = query.filter(User.role == UserRole.ADMIN).first()
        if admin_user:
            return admin_user

        return User(
            id="usr_admin_default",
            org_id="org_default",
            name="System Admin",
            email="admin@brandtrace.internal",
            role=UserRole.ADMIN,
        )

    # 3. Production Path: Unauthenticated requests are strictly rejected
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required: missing or invalid Bearer token. Role switcher is disabled in production."
    )


def require_roles(allowed_roles: List[UserRole]):
    """
    Dependency factory: enforce role-based access on an endpoint.
    Always active regardless of ALLOW_ROLE_SWITCHER — the guard is never bypassed.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied: role '{current_user.role.value}' is not permitted. "
                    f"Required: {[r.value for r in allowed_roles]}"
                ),
            )
        return current_user

    return role_checker
