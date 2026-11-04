from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.audit import AuditLog
from app.auth.guards import require_roles
from app.schemas.governance import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit Trail"])

@router.get("", response_model=List[AuditLogResponse])
def get_audit_trail(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.REVIEWER]))
):
    """
    Query the append-only audit trail.
    Role-gated: Admin and Reviewer ONLY. Creator and Agency receive 403 Forbidden.
    Supports filtering by fact, content item, or user.
    """
    query = db.query(AuditLog)

    if entity_type:
        query = query.filter(AuditLog.entity_type == str(entity_type))
    if entity_id:
        query = query.filter(AuditLog.entity_id == str(entity_id))
    if actor_id:
        query = query.filter(AuditLog.actor_id == str(actor_id))
    if action:
        query = query.filter(AuditLog.action == str(action))

    logs = query.order_by(desc(AuditLog.created_at)).limit(limit).all()
    return logs
