"""
Semantic Conflicts Action Router (Improvement 2 — Part A).

Endpoints:
  POST /semantic-conflicts/{conflict_id}/dismiss  — Require justification, create Precedent + AuditLog
  POST /semantic-conflicts/{conflict_id}/approve  — Mark conflict fix approved + AuditLog

RBAC:
  - Decision mutations: Admin, Reviewer only (Agency gets 403).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth.guards import require_roles
from app.config import IST
from app.database import get_db
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.governance import Precedent, SemanticConflict
from app.services.rule_synthesizer import synthesize_proposed_rules

router = APIRouter(prefix="/semantic-conflicts", tags=["Semantic Conflicts"])


class SemanticDismissRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if len(cleaned) < 10:
            raise ValueError("Dismiss justification must be at least 10 non-whitespace characters.")
        return cleaned


class SemanticApproveRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/{conflict_id}/dismiss")
def dismiss_semantic_conflict(
    conflict_id: str,
    payload: SemanticDismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.REVIEWER])),
) -> Dict[str, Any]:
    """
    Dismiss a detected semantic conflict with mandatory justification.
    Creates a Precedent (feeding Improvement 3 Rule Synthesizer) and AuditLog record.
    """
    conflict = db.query(SemanticConflict).filter(SemanticConflict.id == conflict_id).first()
    if not conflict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Semantic conflict '{conflict_id}' not found",
        )

    old_status = conflict.status
    now = datetime.now(IST)
    conflict.status = "dismissed"
    conflict.decided_by = current_user.id
    conflict.decided_at = now
    conflict.decision_reason = payload.reason

    summary = (
        f"Semantic conflict ({conflict.category}) between {conflict.channel_a} "
        f"('{conflict.snippet_a}') and {conflict.channel_b} ('{conflict.snippet_b}'): "
        f"{conflict.reason}"
    )
    precedent = Precedent(
        id=str(uuid.uuid4()),
        rule_id="R002",
        finding_id=None,
        reviewer_id=current_user.id,
        reason=payload.reason,
        finding_summary=summary[:500],
        finding_type=(conflict.category or "claim").lower(),
        resolution_action="dismissed",
        timestamp=now,
    )
    db.add(precedent)
    db.flush()

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="semantic_conflict",
            entity_id=conflict.id,
            action="SEMANTIC_CONFLICT_DISMISS",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            old_values={"status": old_status},
            new_values={"status": "dismissed", "precedent_id": precedent.id},
            reason=payload.reason,
            created_at=now,
        )
    )

    created_rules = synthesize_proposed_rules(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
    )

    db.commit()
    return {
        "status": "dismissed",
        "conflict_id": conflict.id,
        "precedent_id": precedent.id,
        "proposed_rules_created": [
            {"id": r.id, "title": r.title, "finding_type": r.finding_type}
            for r in created_rules
        ],
    }


@router.post("/{conflict_id}/approve")
def approve_semantic_conflict_fix(
    conflict_id: str,
    payload: Optional[SemanticApproveRequest] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.REVIEWER])),
) -> Dict[str, Any]:
    """Mark a semantic conflict resolution as approved and record AuditLog."""
    conflict = db.query(SemanticConflict).filter(SemanticConflict.id == conflict_id).first()
    if not conflict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Semantic conflict '{conflict_id}' not found",
        )

    old_status = conflict.status
    now = datetime.now(IST)
    reason_text = (
        (payload.reason.strip() if payload and payload.reason else "")
        or "Approved cross-channel alignment fix"
    )
    conflict.status = "approved"
    conflict.decided_by = current_user.id
    conflict.decided_at = now
    conflict.decision_reason = reason_text

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="semantic_conflict",
            entity_id=conflict.id,
            action="SEMANTIC_CONFLICT_APPROVE",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            old_values={"status": old_status},
            new_values={"status": "approved"},
            reason=reason_text,
            created_at=now,
        )
    )
    db.commit()

    return {
        "status": "approved",
        "conflict_id": conflict.id,
        "reason": reason_text,
    }

