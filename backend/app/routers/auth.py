from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.auth import User
from app.auth.guards import get_current_user
from app.auth.jwt import verify_password, create_access_token
from app.schemas.auth import UserResponse, UserPublicResponse, LoginRequest, TokenResponse

router = APIRouter(tags=["Authentication & Users"])


@router.post("/auth/login", response_model=TokenResponse)
@router.post("/users/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate against seeded demo users or database users.
    Demo user accounts (password: BrandTrace2026!):
      • Admin:    admin@aura-audio.com
      • Creator:  creator@aura-audio.com
      • Reviewer: reviewer@aura-audio.com
      • Agency:   agency@aura-audio.com (or agency@partner.com)
    """
    email_clean = payload.email.strip().lower()

    # Match by email or username prefix
    user = db.query(User).filter(User.email.ilike(email_clean)).first()
    if not user:
        # Check alias for agency
        if "agency" in email_clean:
            user = db.query(User).filter(User.email.ilike("%agency%")).first()
        elif "admin" in email_clean:
            user = db.query(User).filter(User.email.ilike("%admin%")).first()
        elif "creator" in email_clean:
            user = db.query(User).filter(User.email.ilike("%creator%")).first()
        elif "reviewer" in email_clean:
            user = db.query(User).filter(User.email.ilike("%reviewer%")).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials: user not found"
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials: incorrect password. (Demo password: 'BrandTrace2026!')"
        )

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role.value})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserPublicResponse.model_validate(user)
    )


@router.get("/auth/me", response_model=UserResponse)
@router.get("/users/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Retrieve currently active user profile and role."""
    return current_user


@router.get("/users", response_model=List[UserPublicResponse])
def list_demo_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List directory users returning non-sensitive fields only (no emails or org internals)."""
    return db.query(User).all()
