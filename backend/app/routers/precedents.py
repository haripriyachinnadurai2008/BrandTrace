from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.governance import Precedent
from app.auth.guards import get_current_user
from app.schemas.governance import PrecedentResponse

router = APIRouter(prefix="/precedents", tags=["Precedents (Living Guidelines Lite)"])

@router.get("", response_model=List[PrecedentResponse])
def list_precedents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List historical reviewer overrides and precedents. Agency is restricted to assigned campaign."""
    query = db.query(Precedent).order_by(desc(Precedent.timestamp))
    if current_user.role == UserRole.AGENCY:
        if not current_user.assigned_campaign_id:
            return []
        from app.models.claims import Finding
        from app.models.content import ContentVersion, ContentItem
        query = (
            query.join(Finding, Precedent.finding_id == Finding.id)
            .join(ContentVersion, Finding.content_version_id == ContentVersion.version_id)
            .join(ContentItem, ContentVersion.content_id == ContentItem.id)
            .filter(ContentItem.campaign_id == current_user.assigned_campaign_id)
        )
    return query.all()
