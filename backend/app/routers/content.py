import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.content import ContentItem, ContentVersion
from app.models.claims import Finding, ExtractedClaim, ClaimFactLink
from app.models.facts import BrandFact, FactVersion
from app.services.rule_synthesizer import classify_finding_type, find_matching_active_guideline
from app.models.governance import Review, Notification
from app.models.audit import AuditLog
from app.auth.guards import get_current_user, require_roles
from app.schemas.content import PublishStatusRequest, ApproveRequest, ContentItemResponse
from app.services.normalizer import IST

router = APIRouter(prefix="/content", tags=["Content Governance"])


@router.post("/{content_id}/check")
def check_content(
    content_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CREATOR, UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Phase 2 — Deterministic extraction + verification pipeline.
    Tokenises text, calls LLM (or cache), matches claims to facts,
    runs verifier, and persists findings.
    Returns structured findings with excerpts, tier, confidence, source.
    """
    from app.services.checker import run_check
    try:
        result = run_check(
            db=db,
            content_id=content_id,
            actor_id=current_user.id,
            actor_role=current_user.role.value,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Check failed: {str(e)}")

class CreateContentRequest(BaseModel):
    title: str
    channel: str
    raw_text: str
    campaign_id: Optional[str] = None


@router.post("", status_code=status.HTTP_201_CREATED)
def create_content(
    payload: CreateContentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CREATOR, UserRole.ADMIN])),
):
    """Create a new content item with its first version."""
    import hashlib

    title = payload.title.strip()
    raw_text = payload.raw_text.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title cannot be empty")
    if not raw_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Content body text cannot be empty")

    ci = ContentItem(
        id=str(uuid.uuid4()),
        org_id=current_user.org_id,
        campaign_id=payload.campaign_id or "camp_festive_launch",
        title=title,
        channel=payload.channel.strip().lower(),
        current_state="draft",
        owner_id=current_user.id,
        created_at=datetime.now(IST),
    )
    db.add(ci)
    db.flush()

    version_hash = hashlib.sha256(raw_text.encode()).hexdigest()
    cv = ContentVersion(
        version_id=str(uuid.uuid4()),
        content_id=ci.id,
        version_no=1,
        raw_text=raw_text,
        version_hash=version_hash,
        state="draft",
        created_at=datetime.now(IST),
    )
    db.add(cv)
    db.commit()

    return {"id": ci.id, "title": ci.title, "version_id": cv.version_id}


@router.get("", response_model=List[ContentItemResponse])
def list_content(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all content items with their current state. Agency is restricted to assigned campaign."""
    query = db.query(ContentItem)
    if current_user.role == UserRole.AGENCY:
        if current_user.assigned_campaign_id:
            query = query.filter(ContentItem.campaign_id == current_user.assigned_campaign_id)
        else:
            return []
    items = query.all()
    res = []
    for ci in items:
        latest_cv = (
            db.query(ContentVersion)
            .filter(ContentVersion.content_id == ci.id)
            .order_by(desc(ContentVersion.version_no))
            .first()
        )
        res.append(ContentItemResponse(
            id=ci.id,
            title=ci.title,
            channel=ci.channel,
            current_state=ci.current_state,
            owner_id=ci.owner_id,
            campaign_id=ci.campaign_id,
            created_at=ci.created_at,
            current_version=latest_cv
        ))
    return res

@router.get("/{content_id}")
def get_content_detail(
    content_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve full content item details. Agency is restricted to assigned campaign."""
    ci = db.query(ContentItem).filter(ContentItem.id == content_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail=f"Content item '{content_id}' not found")

    if current_user.role == UserRole.AGENCY:
        if ci.campaign_id != current_user.assigned_campaign_id:
            raise HTTPException(status_code=403, detail="Agency users may only access content from their assigned campaign")

    latest_cv = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == ci.id)
        .order_by(desc(ContentVersion.version_no))
        .first()
    )

    findings_out = []
    claims = []
    if latest_cv:
        raw_findings = db.query(Finding).filter(Finding.content_version_id == latest_cv.version_id).all()
        claims = latest_cv.claims
        claims_by_id = {c.id: c for c in claims}
        for f in raw_findings:
            c = claims_by_id.get(f.claim_id)
            fv = None
            bf = None
            if c:
                link = (
                    db.query(ClaimFactLink)
                    .filter(ClaimFactLink.claim_id == c.id)
                    .order_by(ClaimFactLink.created_at.desc())
                    .first()
                )
                if link:
                    fv = db.query(FactVersion).filter(FactVersion.version_id == link.fact_version_id).first()
                    if fv:
                        bf = db.query(BrandFact).filter(BrandFact.id == fv.fact_id).first()
                        # If finding cites a newer source/page (e.g. post-cascade), resolve that version
                        if f.source_reference and " p." in f.source_reference:
                            cited_doc = f.source_reference.split(" p.")[0].strip()
                            matching_fv = (
                                db.query(FactVersion)
                                .filter(FactVersion.fact_id == fv.fact_id, FactVersion.source_id == cited_doc)
                                .order_by(FactVersion.version_no.desc())
                                .first()
                            )
                            if matching_fv:
                                fv = matching_fv

            ftype = classify_finding_type(finding=f, claim=c, summary_text=f.reason)
            matched_guideline = find_matching_active_guideline(
                db,
                finding_type=ftype,
                claim_text=c.raw_span_text if c else "",
                subject=c.subject if c else "",
                reason_text=f.reason or "",
            )

            findings_out.append({
                "id": f.id,
                "content_version_id": f.content_version_id,
                "claim_id": f.claim_id,
                "risk_tier": f.risk_tier,
                "reason": f.reason,
                "source_reference": f.source_reference,
                "extraction_confidence": f.extraction_confidence,
                "status": f.status,
                "fix_options": f.fix_options,
                "created_at": f.created_at,
                "raw_span_text": c.raw_span_text if c else "",
                "normalised_value": c.normalised_value if c else "",
                "claim_type": c.value_type if c else "text",
                "claim_subject": c.subject if c else None,
                "verified_value": fv.value if fv else None,
                "fact_id": bf.id if bf else (fv.fact_id if fv else None),
                "fact_name": bf.name if bf else None,
                "matches_rule": matched_guideline["title"] if matched_guideline else None,
                "matches_rule_version": matched_guideline["version"] if matched_guideline else None,
                "evidence_document_id": c.evidence_document_id if c else None,
                "evidence_page": c.evidence_page if c else None,
                "evidence_rects": c.evidence_rects if c else None,
                "evidence_page_width": c.evidence_page_width if c else None,
                "evidence_page_height": c.evidence_page_height if c else None,
                "evidence_located": c.evidence_located if c else None,
                "evidence_reason": c.evidence_reason if c else None,
            })

    return {
        "content_item": ci,
        "latest_version": latest_cv,
        "claims": claims,
        "findings": findings_out
    }

@router.post("/{content_id}/publish-status")
def update_publish_status(
    content_id: str,
    payload: PublishStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CREATOR]))
):
    """
    Creator marks content as Published (live) with URL and date, or Archived.
    Admin, Reviewer, and Agency are forbidden (403).
    """
    ci = db.query(ContentItem).filter(ContentItem.id == content_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail=f"Content item '{content_id}' not found")

    target_state = payload.state.lower().strip()
    if target_state not in ("live", "archived", "draft"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state '{target_state}'. Must be 'live', 'archived', or 'draft'."
        )

    latest_cv = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == ci.id)
        .order_by(desc(ContentVersion.version_no))
        .first()
    )
    if not latest_cv:
        raise HTTPException(status_code=404, detail="No content version found")

    old_state = latest_cv.state
    now = datetime.now(IST)

    latest_cv.state = target_state
    ci.current_state = target_state

    if target_state == "live":
        latest_cv.published_at = payload.published_at or now
        if payload.publish_url:
            latest_cv.publish_url = payload.publish_url
    elif target_state == "archived":
        latest_cv.archived_at = payload.archived_at or now

    # Write audit log
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        entity_type="content_item",
        entity_id=ci.id,
        action="PUBLISH_STATUS",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        old_values={"state": old_state},
        new_values={"state": target_state, "publish_url": latest_cv.publish_url},
        reason=f"Status transition from {old_state} to {target_state}",
        created_at=now
    ))

    db.commit()
    return {
        "status": "success",
        "content_id": ci.id,
        "new_state": target_state,
        "publish_url": latest_cv.publish_url
    }

@router.post("/{content_id}/approve")
def approve_content(
    content_id: str,
    payload: ApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ADMIN]))
):
    """
    Role-gated editorial approval:
    Only Reviewer or Admin can approve.
    STRICTLY REJECTED if open Critical or High findings exist.
    """
    ci = db.query(ContentItem).filter(ContentItem.id == content_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail=f"Content item '{content_id}' not found")

    latest_cv = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == ci.id)
        .order_by(desc(ContentVersion.version_no))
        .first()
    )
    if not latest_cv:
        raise HTTPException(status_code=404, detail="No content version found")

    # Check for blocking open findings (Critical or High)
    blocking_findings = (
        db.query(Finding)
        .filter(
            Finding.content_version_id == latest_cv.version_id,
            Finding.risk_tier.in_(["Critical", "High"]),
            Finding.status == "open"
        )
        .all()
    )

    if blocking_findings:
        reasons = [f"[{f.risk_tier}] {f.reason}" for f in blocking_findings]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": f"Approval rejected: Content contains {len(blocking_findings)} unresolved blocking finding(s).",
                "blocking_reasons": reasons
            }
        )

    now = datetime.now(IST)
    old_state = latest_cv.state
    latest_cv.state = "approved"
    ci.current_state = "approved"
    latest_cv.approved_at = now

    # Record review decision
    review = Review(
        id=str(uuid.uuid4()),
        content_version_id=latest_cv.version_id,
        reviewer_id=current_user.id,
        action="approved",
        reason=payload.reason,
        created_at=now
    )
    db.add(review)

    # Record audit log
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        entity_type="content_item",
        entity_id=ci.id,
        action="APPROVE",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        old_values={"state": old_state},
        new_values={"state": "approved", "approved_at": now.isoformat()},
        reason=payload.reason,
        created_at=now
    ))

    db.commit()
    return {
        "status": "approved",
        "content_id": ci.id,
        "state": "approved",
        "approved_by": current_user.name,
        "approved_at": now.isoformat()
    }
