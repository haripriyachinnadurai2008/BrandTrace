import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.campaign import Campaign
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim
from app.auth.guards import get_current_user, require_roles
from app.config import IST

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


class CreateCampaignRequest(BaseModel):
    name: str
    description: Optional[str] = None
    approved_offer: Optional[str] = None


@router.get("")
def list_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active campaigns. Agency is restricted to assigned campaign."""
    query = db.query(Campaign)
    if current_user.role == UserRole.AGENCY:
        if current_user.assigned_campaign_id:
            query = query.filter(Campaign.id == current_user.assigned_campaign_id)
        else:
            return []
    campaigns = query.all()
    result = []
    for c in campaigns:
        items = db.query(ContentItem).filter(ContentItem.campaign_id == c.id).all()
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "approved_offer": c.approved_offer,
            "status": c.status,
            "content_count": len(items),
            "created_at": c.created_at,
        })
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CreateCampaignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.CREATOR])),
):
    campaign = Campaign(
        id=str(uuid.uuid4()),
        org_id=current_user.org_id,
        name=payload.name,
        description=payload.description,
        approved_offer=payload.approved_offer,
        status="active",
        created_at=datetime.now(IST),
    )
    db.add(campaign)
    db.commit()
    return {"id": campaign.id, "name": campaign.name}


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get single campaign details. Agency is restricted to assigned campaign."""
    if current_user.role == UserRole.AGENCY:
        if current_user.assigned_campaign_id != campaign_id:
            raise HTTPException(status_code=403, detail="Agency users may only access their assigned campaign")

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")
    items = db.query(ContentItem).filter(ContentItem.campaign_id == campaign_id).all()
    return {
        "id": campaign.id,
        "name": campaign.name,
        "description": campaign.description,
        "approved_offer": campaign.approved_offer,
        "status": campaign.status,
        "created_at": campaign.created_at,
        "content_items": [
            {"id": i.id, "title": i.title, "channel": i.channel, "state": i.current_state}
            for i in items
        ],
    }


@router.post("/{campaign_id}/check-coherence")
def check_coherence(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CREATOR, UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Phase 4 — Campaign Coherence Lite (Named Improvement #2).
    Deterministic cross-channel contradiction detector.
    No LLM verdict — pure value comparison.
    """
    from app.services.coherence import check_campaign_coherence
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")

    findings = check_campaign_coherence(db, campaign_id)
    db.commit()

    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.name,
        "findings_count": len(findings),
        "has_contradictions": len(findings) > 0,
        "findings": findings,
    }


@router.post("/{campaign_id}/semantic-check")
def run_campaign_semantic_check(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.REVIEWER, UserRole.CREATOR])),
):
    """
    Improvement 2 — Part A:
    Cross-channel semantic conflict detection across pairs of campaign assets on different
    channels. Tokenizes numbers before Groq, strictly validates verbatim snippets +
    confidence >= 0.6, and falls back deterministically on Groq error/missing key.
    RBAC: Admin, Reviewer, Creator allowed; Agency gets 403.
    """
    from app.services.semantic_coherence import run_semantic_coherence_check

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")

    return run_semantic_coherence_check(
        db=db,
        campaign_id=campaign_id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
    )


@router.get("/{campaign_id}/semantic-conflicts")
def get_campaign_semantic_conflicts(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.REVIEWER, UserRole.CREATOR])),
):
    """
    List stored cross-channel semantic conflicts for a campaign.
    RBAC: Admin, Reviewer, Creator may view; Agency gets 403.
    """
    from app.services.semantic_coherence import list_campaign_semantic_conflicts

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found")

    conflicts = list_campaign_semantic_conflicts(db, campaign_id)
    fallback_used = any(bool(c.get("fallback_used")) for c in conflicts)
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.name,
        "conflicts_count": len(conflicts),
        "open_count": sum(1 for c in conflicts if c.get("status") == "open"),
        "fallback_used": fallback_used,
        "conflicts": conflicts,
    }
