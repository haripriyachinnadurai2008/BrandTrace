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
from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.claims import Finding, ExtractedClaim, ClaimFactLink
from app.models.facts import BrandFact, FactVersion
from app.models.governance import Precedent, Rule
from app.models.audit import AuditLog
from app.auth.guards import get_current_user, require_roles
from app.config import IST
from app.services.rule_synthesizer import (
    classify_finding_type,
    find_matching_active_guideline,
    synthesize_proposed_rules,
)

router = APIRouter(prefix="/findings", tags=["Findings"])


class DismissRequest(BaseModel):
    reason: str = Field(..., min_length=10, description="Mandatory reason for override/dismissal")
    resolution_action: str = Field(
        default="dismissed",
        description="override | dismissed | accepted",
    )

    @field_validator("reason")
    @classmethod
    def _reason_must_be_meaningful(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 10:
            raise ValueError("Justification must be at least 10 characters.")
        return cleaned


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

    claim = db.query(ExtractedClaim).filter(ExtractedClaim.id == finding.claim_id).first()
    fv = None
    bf = None
    if claim:
        link = (
            db.query(ClaimFactLink)
            .filter(ClaimFactLink.claim_id == claim.id)
            .order_by(ClaimFactLink.created_at.desc())
            .first()
        )
        if link:
            fv = db.query(FactVersion).filter(FactVersion.version_id == link.fact_version_id).first()
            if fv:
                bf = db.query(BrandFact).filter(BrandFact.id == fv.fact_id).first()

    matched_guideline = None
    if claim:
        ftype = classify_finding_type(finding=finding, claim=claim, summary_text=finding.reason)
        matched_guideline = find_matching_active_guideline(
            db,
            finding_type=ftype,
            claim_text=claim.raw_span_text or "",
            subject=claim.subject or "",
            reason_text=finding.reason or "",
        )

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
        "raw_span_text": claim.raw_span_text if claim else "",
        "normalised_value": claim.normalised_value if claim else "",
        "verified_value": fv.value if fv else None,
        "fact_id": bf.id if bf else (fv.fact_id if fv else None),
        "fact_name": bf.name if bf else None,
        "matches_rule": matched_guideline["title"] if matched_guideline else None,
        "matches_rule_version": matched_guideline["version"] if matched_guideline else None,
        "evidence_document_id": claim.evidence_document_id if claim else None,
        "evidence_page": claim.evidence_page if claim else None,
        "evidence_rects": claim.evidence_rects if claim else None,
        "evidence_page_width": claim.evidence_page_width if claim else None,
        "evidence_page_height": claim.evidence_page_height if claim else None,
        "evidence_located": claim.evidence_located if claim else None,
        "evidence_reason": claim.evidence_reason if claim else None,
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

    claim = db.query(ExtractedClaim).filter(ExtractedClaim.id == finding.claim_id).first()
    ftype = classify_finding_type(
        finding=finding,
        claim=claim,
        summary_text=finding.reason,
        reason_text=payload.reason,
    )

    precedent = Precedent(
        id=str(uuid.uuid4()),
        rule_id=rule.id,
        finding_id=finding.id,
        reviewer_id=current_user.id,
        reason=payload.reason,
        finding_summary=finding.reason[:300],
        finding_type=ftype,
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
    db.flush()

    created_rules = synthesize_proposed_rules(
        db=db,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
    )

    db.commit()

    return {
        "status": "success",
        "finding_id": finding.id,
        "new_status": finding.status,
        "precedent_id": precedent.id,
        "proposed_rules_created": [
            {"id": r.id, "title": r.title, "finding_type": r.finding_type}
            for r in created_rules
        ],
    }

