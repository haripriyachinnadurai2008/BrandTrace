from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.facts import BrandFact, FactVersion
from app.models.campaign import CampaignFact
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, ClaimFactLink
from app.auth.guards import get_current_user, require_roles
from app.schemas.facts import FactVersionCreate, FactVersionResponse, BrandFactResponse, FactImpactResponse, ImpactItemResponse
from app.services.impact_engine import ImpactEngine, ensure_ist
from app.services.normalizer import IST, DeterministicNormalizer

router = APIRouter(prefix="/facts", tags=["Brand Facts"])

@router.get("", response_model=List[BrandFactResponse])
def list_facts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List brand facts with their versions.
    If current_user has role AGENCY, results are strictly scoped to facts
    linked to their assigned campaign.
    """
    if current_user.role == UserRole.AGENCY:
        if not current_user.assigned_campaign_id:
            return []
        fact_ids = (
            db.query(FactVersion.fact_id)
            .join(CampaignFact, CampaignFact.fact_version_id == FactVersion.version_id)
            .filter(CampaignFact.campaign_id == current_user.assigned_campaign_id)
            .distinct()
            .all()
        )
        allowed_ids = [fid[0] for fid in fact_ids]
        return db.query(BrandFact).filter(BrandFact.id.in_(allowed_ids)).all()

    facts = db.query(BrandFact).all()
    return facts

@router.get("/{fact_id}", response_model=BrandFactResponse)
def get_fact(
    fact_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve details and version history for a specific fact.
    Agency users may only access facts associated with their assigned campaign.
    """
    fact = db.query(BrandFact).filter(BrandFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Brand fact '{fact_id}' not found")

    if current_user.role == UserRole.AGENCY:
        if not current_user.assigned_campaign_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Agency user has no assigned campaign"
            )
        linked = (
            db.query(CampaignFact)
            .join(FactVersion, CampaignFact.fact_version_id == FactVersion.version_id)
            .filter(
                CampaignFact.campaign_id == current_user.assigned_campaign_id,
                FactVersion.fact_id == fact_id
            )
            .first()
        )
        if not linked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Agency user cannot access fact '{fact_id}' outside assigned campaign"
            )

    return fact

@router.get("/{fact_id}/impact", response_model=FactImpactResponse)
def preview_fact_impact(
    fact_id: str,
    new_value: str = Query("₹5,499", description="Proposed new value for preview"),
    valid_from: Optional[datetime] = Query(None, description="Proposed effective date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Read-only preview of downstream impact before confirming a fact version update.
    Admin, Reviewer, Creator, and Agency can inspect impact.
    Agency users are restricted to inspecting facts linked to their assigned campaign,
    and impact items are scoped to their assigned campaign's content.
    """
    fact = db.query(BrandFact).filter(BrandFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Brand fact '{fact_id}' not found")

    if current_user.role == UserRole.AGENCY:
        if not current_user.assigned_campaign_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Agency user has no assigned campaign"
            )
        linked = (
            db.query(CampaignFact)
            .join(FactVersion, CampaignFact.fact_version_id == FactVersion.version_id)
            .filter(
                CampaignFact.campaign_id == current_user.assigned_campaign_id,
                FactVersion.fact_id == fact_id
            )
            .first()
        )
        if not linked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Agency user cannot inspect impact of fact '{fact_id}' outside assigned campaign"
            )

    if valid_from is None or not isinstance(valid_from, datetime):
        valid_from = datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST)
    elif valid_from.tzinfo is None:
        valid_from = valid_from.replace(tzinfo=IST)
    else:
        valid_from = valid_from.astimezone(IST)

    latest_version = (
        db.query(FactVersion)
        .filter(FactVersion.fact_id == fact_id)
        .order_by(desc(FactVersion.version_no))
        .first()
    )
    next_ver = (latest_version.version_no + 1) if latest_version else 1

    # Query downstream content
    linked_claims = (
        db.query(ClaimFactLink, ExtractedClaim, ContentVersion, ContentItem, User)
        .join(ExtractedClaim, ClaimFactLink.claim_id == ExtractedClaim.id)
        .join(ContentVersion, ExtractedClaim.content_version_id == ContentVersion.version_id)
        .join(ContentItem, ContentVersion.content_id == ContentItem.id)
        .join(User, ContentItem.owner_id == User.id)
        .join(FactVersion, ClaimFactLink.fact_version_id == FactVersion.version_id)
        .filter(FactVersion.fact_id == fact_id)
        .all()
    )

    summary = {"re_review": 0, "stale": 0, "red_alert": 0, "left_alone": 0, "total": 0}
    items: List[ImpactItemResponse] = []
    processed_cvs = set()

    for link, claim, cv, ci, owner in linked_claims:
        if cv.version_id in processed_cvs:
            continue
        if current_user.role == UserRole.AGENCY and ci.campaign_id != current_user.assigned_campaign_id:
            continue
        processed_cvs.add(cv.version_id)

        # Check archived before valid_from
        is_archived_prior = False
        if cv.state.lower() == "archived":
            archive_time = ensure_ist(cv.archived_at or cv.published_at or cv.created_at)
            if archive_time and archive_time < valid_from:
                is_archived_prior = True

        if is_archived_prior:
            summary["left_alone"] += 1
            items.append(ImpactItemResponse(
                content_id=ci.id,
                content_version_id=cv.version_id,
                title=ci.title,
                channel=ci.channel,
                old_state=cv.state,
                new_state=cv.state,
                owner_name=owner.name,
                owner_email=owner.email,
                action_required="Left alone",
                is_red_alert=False,
                is_stale=False,
                is_re_review=False,
                is_left_alone=True,
                outdated_value=claim.raw_span_text,
                new_value=new_value,
                priority="None"
            ))
        elif cv.state.lower() in ("approved", "re-review required"):
            summary["re_review"] += 1
            items.append(ImpactItemResponse(
                content_id=ci.id,
                content_version_id=cv.version_id,
                title=ci.title,
                channel=ci.channel,
                old_state="approved",
                new_state="re-review required",
                owner_name=owner.name,
                owner_email=owner.email,
                action_required="Re-review required",
                is_red_alert=False,
                is_stale=False,
                is_re_review=True,
                is_left_alone=False,
                outdated_value=claim.raw_span_text,
                new_value=new_value,
                priority="High"
            ))
        elif cv.state.lower() == "draft":
            summary["stale"] += 1
            items.append(ImpactItemResponse(
                content_id=ci.id,
                content_version_id=cv.version_id,
                title=ci.title,
                channel=ci.channel,
                old_state="draft",
                new_state="draft (stale)",
                owner_name=owner.name,
                owner_email=owner.email,
                action_required="Marked stale",
                is_red_alert=False,
                is_stale=True,
                is_re_review=False,
                is_left_alone=False,
                outdated_value=claim.raw_span_text,
                new_value=new_value,
                priority="Medium"
            ))
        elif cv.state.lower() == "live":
            summary["red_alert"] += 1
            items.append(ImpactItemResponse(
                content_id=ci.id,
                content_version_id=cv.version_id,
                title=ci.title,
                channel=ci.channel,
                old_state="live",
                new_state="live",
                owner_name=owner.name,
                owner_email=owner.email,
                action_required="RED ALERT",
                is_red_alert=True,
                is_stale=False,
                is_re_review=False,
                is_left_alone=False,
                outdated_value=claim.raw_span_text,
                new_value=new_value,
                priority="Critical"
            ))

    summary["total"] = len(items)

    return FactImpactResponse(
        fact_id=fact_id,
        fact_name=fact.name,
        new_version_no=next_ver,
        new_value=new_value,
        effective_from=valid_from,
        summary=summary,
        items=items
    )

@router.post("/{fact_id}/versions", status_code=status.HTTP_201_CREATED)
def create_fact_version(
    fact_id: str,
    payload: FactVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN]))
):
    """
    ATOMIC TRANSACTION:
    Inserts new fact version, closes old valid_to, executes impact rules across
    downstream content, invalidates approvals, creates notifications, and records
    audit log entry. Rolls back entirely on any error.
    Enforces Admin-only access.
    Rejects no-op updates where proposed value equals current active value with HTTP 422.
    """
    fact = db.query(BrandFact).filter(BrandFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Brand fact '{fact_id}' not found")

    current_version = (
        db.query(FactVersion)
        .filter(FactVersion.fact_id == fact_id)
        .order_by(desc(FactVersion.version_no))
        .first()
    )
    if current_version:
        normalized_new = DeterministicNormalizer.normalize_any(payload.value).normalised_str
        normalized_cur = (current_version.normalised_value or "").strip().lower()
        if (
            payload.value.strip().lower() == current_version.value.strip().lower()
            or (normalized_new and normalized_new.strip().lower() == normalized_cur)
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"No-op version rejected: Proposed value '{payload.value}' is identical to the current active value '{current_version.value}'."
            )

    try:
        # ImpactEngine operates within a transaction and commits
        result = ImpactEngine.execute_fact_change(
            db=db,
            fact_id=fact_id,
            new_value=payload.value,
            unit=payload.unit,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
            source_id=payload.source_id,
            source_page=payload.source_page,
            actor=current_user,
            reason=payload.reason
        )
        db.commit()
        return result
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        if "No-op" in str(e):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Atomic transaction rolled back. Error: {str(e)}"
        )
