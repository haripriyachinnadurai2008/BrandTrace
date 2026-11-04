"""
Findings router.

Endpoints:
  GET  /findings/{id}         — retrieve a single finding
  POST /findings/{id}/dismiss — Reviewer overrides/dismisses with mandatory reason
                                 → writes Precedent row (Phase 5 Living Guidelines)
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.claims import Finding
from app.models.governance import Precedent, Rule
from app.models.audit import AuditLog
from app.auth.guards import get_current_user, require_roles
from app.config import IST

router = APIRouter(prefix="/findings", tags=["Findings"])


class DismissRequest(BaseModel):
    reason: str = Field(..., min_length=10, description="Mandatory reason for override/dismissal")
    resolution_action: str = Field(
        default="dismissed",
        description="override | dismissed | accepted",
    )


@router.get("/{finding_id}")
def get_finding(
    finding_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found")

    if current_user.role == UserRole.AGENCY:
        from app.models.content import ContentVersion, ContentItem
        cv = db.query(ContentVersion).filter(ContentVersion.version_id == finding.content_version_id).first()
        ci = db.query(ContentItem).filter(ContentItem.id == cv.content_id).first() if cv else None
        if not ci or ci.campaign_id != current_user.assigned_campaign_id:
            raise HTTPException(status_code=403, detail="Agency users may only access findings from their assigned campaign")

    return {
        "id": finding.id,
        "content_version_id": finding.content_version_id,
        "claim_id": finding.claim_id,
        "risk_tier": finding.risk_tier,
        "reason": finding.reason,
        "source_reference": finding.source_reference,
        "extraction_confidence": finding.extraction_confidence,
        "status": finding.status,
        "fix_options": finding.fix_options,
        "created_at": finding.created_at,
    }


@router.post("/{finding_id}/dismiss")
def dismiss_finding(
    finding_id: str,
    payload: DismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Phase 5 — Living Guidelines Lite.
    Reviewer dismisses / overrides a finding. Requires a reason (≥10 chars).
    Writes a Precedent row for future pattern analysis.
    """
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found")

    if finding.status in ("dismissed", "overridden"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Finding already has status '{finding.status}'",
        )

    now = datetime.now(IST)
    finding.status = payload.resolution_action

    # Find or create a default rule for this risk tier
    rule = db.query(Rule).filter(Rule.name == f"rule_{finding.risk_tier.lower()}").first()
    if not rule:
        rule = Rule(
            id=str(uuid.uuid4()),
            name=f"rule_{finding.risk_tier.lower()}",
            description=f"Auto-created rule for {finding.risk_tier} tier findings",
            severity=finding.risk_tier,
            rule_type="governance",
            created_at=now,
        )
        db.add(rule)
        db.flush()

    precedent = Precedent(
        id=str(uuid.uuid4()),
        rule_id=rule.id,
        finding_id=finding.id,
        reviewer_id=current_user.id,
        reason=payload.reason,
        finding_summary=finding.reason[:300],
        resolution_action=payload.resolution_action,
        timestamp=now,
    )
    db.add(precedent)

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        entity_type="finding",
        entity_id=finding.id,
        action="DISMISS",
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        old_values={"status": "open"},
        new_values={"status": payload.resolution_action, "reason": payload.reason},
        reason=payload.reason,
        created_at=now,
    ))

    db.commit()

    return {
        "status": "success",
        "finding_id": finding.id,
        "new_status": finding.status,
        "precedent_id": precedent.id,
    }

