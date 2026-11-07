from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.auth import User
from app.models.facts import EvidenceSource
from app.auth.guards import get_current_user

router = APIRouter(prefix="/sources", tags=["Evidence Sources"])


class EvidenceSourceResponse(BaseModel):
    id: str
    org_id: str
    title: str
    file_name: str
    file_type: str
    excerpt: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[EvidenceSourceResponse])
def list_evidence_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all official evidence sources available for the organization.
    Admin, Reviewer, Creator, and Agency can inspect evidence sources.
    """
    return (
        db.query(EvidenceSource)
        .filter(EvidenceSource.org_id == current_user.org_id)
        .order_by(EvidenceSource.created_at.desc())
        .all()
    )

