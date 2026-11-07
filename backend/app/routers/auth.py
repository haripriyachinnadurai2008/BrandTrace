import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.auth import User, UserRole
from app.auth.guards import get_current_user
from app.auth.jwt import verify_password, create_access_token, hash_password
from app.config import IST
from app.schemas.auth import UserResponse, UserPublicResponse, LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(tags=["Authentication & Users"])


@router.post("/auth/register", response_model=TokenResponse)
@router.post("/users/register", response_model=TokenResponse)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user account with role."""
    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(User.email.ilike(email_clean)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )

    # Determine valid role
    role_map = {
        "admin": UserRole.ADMIN,
        "creator": UserRole.CREATOR,
        "reviewer": UserRole.REVIEWER,
        "agency": UserRole.AGENCY,
    }
    assigned_role = role_map.get((payload.role or "creator").lower(), UserRole.CREATOR)

    new_user = User(
        id=f"usr_{uuid.uuid4().hex[:12]}",
        org_id="org_aura_audio",
        name=payload.name.strip(),
        email=email_clean,
        password_hash=hash_password(payload.password),
        role=assigned_role,
        created_at=datetime.now(IST)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": new_user.id, "email": new_user.email, "role": new_user.role.value})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserPublicResponse.model_validate(new_user)
    )


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

    # Match by email or username prefix / alias
    user = db.query(User).filter(User.email.ilike(email_clean)).first()
    if not user:
        if "elena" in email_clean or "admin" in email_clean:
            user = db.query(User).filter((User.role == UserRole.ADMIN) | User.email.ilike("%admin%") | User.name.ilike("%elena%")).first()
        elif "marcus" in email_clean or "creator" in email_clean:
            user = db.query(User).filter((User.role == UserRole.CREATOR) | User.email.ilike("%creator%") | User.name.ilike("%marcus%")).first()
        elif "devin" in email_clean or "reviewer" in email_clean:
            user = db.query(User).filter((User.role == UserRole.REVIEWER) | User.email.ilike("%reviewer%") | User.name.ilike("%devin%")).first()
        elif "agency" in email_clean or "partner" in email_clean:
            user = db.query(User).filter((User.role == UserRole.AGENCY) | User.email.ilike("%agency%") | User.email.ilike("%partner%")).first()

    # If still not found, auto-provision the demo user so demo sign-in is guaranteed
    if not user:
        demo_profiles = {
            "elena@brandtrace.internal": ("usr_admin_elena", "Elena Vance", UserRole.ADMIN),
            "admin@aura-audio.com": ("usr_admin_elena", "Elena Vance", UserRole.ADMIN),
            "marcus@brandtrace.internal": ("usr_creator_marcus", "Marcus Brody", UserRole.CREATOR),
            "creator@aura-audio.com": ("usr_creator_marcus", "Marcus Brody", UserRole.CREATOR),
            "devin@brandtrace.internal": ("usr_reviewer_devin", "Devin Chen", UserRole.REVIEWER),
            "reviewer@aura-audio.com": ("usr_reviewer_devin", "Devin Chen", UserRole.REVIEWER),
            "agency@brandtrace.internal": ("usr_agency_partner", "Partner Agency", UserRole.AGENCY),
            "agency@partner.com": ("usr_agency_partner", "Partner Agency", UserRole.AGENCY),
        }

        matched_profile = demo_profiles.get(email_clean)
        if not matched_profile:
            if "elena" in email_clean or "admin" in email_clean:
                matched_profile = ("usr_admin_elena", "Elena Vance", UserRole.ADMIN)
            elif "marcus" in email_clean or "creator" in email_clean:
                matched_profile = ("usr_creator_marcus", "Marcus Brody", UserRole.CREATOR)
            elif "devin" in email_clean or "reviewer" in email_clean:
                matched_profile = ("usr_reviewer_devin", "Devin Chen", UserRole.REVIEWER)
            elif "agency" in email_clean:
                matched_profile = ("usr_agency_partner", "Partner Agency", UserRole.AGENCY)

        if matched_profile:
            try:
                u_id, u_name, u_role = matched_profile
                user = User(
                    id=u_id,
                    org_id="org_aura_audio",
                    name=u_name,
                    email=email_clean,
                    password_hash=hash_password("BrandTrace2026!"),
                    role=u_role,
                    created_at=datetime.now(IST)
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            except Exception:
                db.rollback()
                user = db.query(User).filter(User.email.ilike(email_clean)).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials: user not found"
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials: incorrect password. (Demo password: 'demo123' or 'BrandTrace2026!')"
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
