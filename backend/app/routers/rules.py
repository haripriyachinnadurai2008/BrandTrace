"""
Proposed Rules & Living Guidelines Router (Improvement 3).

Endpoints:
  GET  /rules/proposed       — List synthesized Proposed Rules with supporting precedents (Admin only)
  GET  /rules/guidelines     — List versioned Living Guidelines (Admin, Creator, Reviewer)
  POST /rules/{id}/approve   — Approve a proposed rule -> create versioned Guideline + AuditLog (Admin only)
  POST /rules/{id}/reject    — Reject a proposed rule -> update status + AuditLog (Admin only)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.auth.guards import require_roles
from app.config import IST
from app.database import get_db
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.governance import Guideline, Precedent, ProposedRule
from app.schemas.governance import (
    GuidelineResponse,
    PrecedentResponse,
    ProposedRuleResponse,
    RuleDecisionRequest,
)

router = APIRouter(prefix="/rules", tags=["Proposed Rules & Guidelines"])


def _serialize_proposed_rule(rule: ProposedRule) -> ProposedRuleResponse:
    supporting: List[PrecedentResponse] = []
    for lnk in sorted(rule.precedent_links, key=lambda x: x.created_at):
        if lnk.precedent:
            supporting.append(PrecedentResponse.model_validate(lnk.precedent))
    guidelines = [GuidelineResponse.model_validate(g) for g in rule.guidelines]
    return ProposedRuleResponse(
        id=rule.id,
        title=rule.title,
        description=rule.description,
        suggested_policy_text=rule.suggested_policy_text,
        finding_type=rule.finding_type,
        status=rule.status,
        created_at=rule.created_at,
        decided_by=rule.decided_by,
        decided_at=rule.decided_at,
        supporting_precedents=supporting,
        guidelines=guidelines,
    )


@router.get("/proposed", response_model=List[ProposedRuleResponse])
def list_proposed_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
):
    """List all synthesized proposed rules and their supporting precedents. Admin only."""
    rules = (
        db.query(ProposedRule)
        .order_by(desc(ProposedRule.created_at))
        .all()
    )
    return [_serialize_proposed_rule(r) for r in rules]


@router.get("/guidelines", response_model=List[GuidelineResponse])
def list_guidelines(
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.CREATOR, UserRole.REVIEWER])),
):
    """List Living Guidelines with version numbers. Admin, Creator, and Reviewer only."""
    q = db.query(Guideline)
    if active_only:
        q = q.filter(Guideline.active.is_(True))
    return q.order_by(desc(Guideline.created_at), desc(Guideline.version)).all()


@router.post("/{rule_id}/approve")
def approve_proposed_rule(
    rule_id: str,
    payload: Optional[RuleDecisionRequest] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
) -> Dict[str, Any]:
    """
    Approve a synthesized ProposedRule (Admin only).
    Creates a new active versioned Guideline row and writes to AuditLog.
    """
    prule = db.query(ProposedRule).filter(ProposedRule.id == rule_id).first()
    if not prule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposed rule '{rule_id}' not found",
        )

    if prule.status != "proposed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposed rule '{rule_id}' already has status '{prule.status}'",
        )

    now = datetime.now(IST)
    final_policy_text = (
        (payload.policy_text.strip() if payload and payload.policy_text else "")
        or prule.suggested_policy_text
    )
    decision_reason = (
        (payload.reason.strip() if payload and payload.reason else "")
        or f"Approved proposed governance rule '{prule.title}'"
    )

    # Determine next version number for this rule (and deactivate any superseded versions)
    max_ver = (
        db.query(func.max(Guideline.version))
        .filter(Guideline.rule_id == prule.id)
        .scalar()
    ) or 0
    next_ver = int(max_ver) + 1

    db.query(Guideline).filter(
        Guideline.rule_id == prule.id,
        Guideline.active.is_(True),
    ).update({"active": False})

    guideline = Guideline(
        id=f"guide_{uuid.uuid4().hex[:12]}",
        rule_id=prule.id,
        title=prule.title,
        finding_type=prule.finding_type,
        version=next_ver,
        text=final_policy_text,
        active=True,
        created_at=now,
    )
    db.add(guideline)

    prule.status = "approved"
    prule.decided_by = current_user.id
    prule.decided_at = now
    db.flush()

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="proposed_rule",
            entity_id=prule.id,
            action="RULE_APPROVE",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            old_values={"status": "proposed"},
            new_values={
                "status": "approved",
                "guideline_id": guideline.id,
                "version": guideline.version,
                "text": guideline.text,
            },
            reason=decision_reason,
            created_at=now,
        )
    )

    db.commit()
    db.refresh(prule)
    db.refresh(guideline)

    return {
        "status": "approved",
        "rule": _serialize_proposed_rule(prule).model_dump(),
        "guideline": GuidelineResponse.model_validate(guideline).model_dump(),
    }


@router.post("/{rule_id}/reject")
def reject_proposed_rule(
    rule_id: str,
    payload: Optional[RuleDecisionRequest] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
) -> Dict[str, Any]:
    """Reject a synthesized ProposedRule and write to AuditLog (Admin only)."""
    prule = db.query(ProposedRule).filter(ProposedRule.id == rule_id).first()
    if not prule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposed rule '{rule_id}' not found",
        )

    if prule.status != "proposed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposed rule '{rule_id}' already has status '{prule.status}'",
        )

    now = datetime.now(IST)
    decision_reason = (
        (payload.reason.strip() if payload and payload.reason else "")
        or f"Rejected proposed governance rule '{prule.title}'"
    )

    prule.status = "rejected"
    prule.decided_by = current_user.id
    prule.decided_at = now

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="proposed_rule",
            entity_id=prule.id,
            action="RULE_REJECT",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            old_values={"status": "proposed"},
            new_values={"status": "rejected"},
            reason=decision_reason,
            created_at=now,
        )
    )

    db.commit()
    db.refresh(prule)
    return {
        "status": "rejected",
        "rule_id": prule.id,
        "rule": _serialize_proposed_rule(prule).model_dump(),
    }

