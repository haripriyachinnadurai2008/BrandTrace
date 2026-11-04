"""Notifications router — in-app notifications for content owners."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.governance import Notification
from app.models.content import ContentItem
from app.auth.guards import get_current_user
from app.schemas.governance import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
def get_my_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return notifications for the currently active user.
    If the user has role AGENCY, results are strictly scoped to notifications
    associated with their assigned campaign (or empty if unassigned).
    """
    if current_user.role == UserRole.AGENCY and not current_user.assigned_campaign_id:
        return []

    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    notifications = q.order_by(desc(Notification.created_at)).limit(limit).all()

    if current_user.role == UserRole.AGENCY:
        scoped = []
        for n in notifications:
            if n.reference_type in ("content_item", "content_version") and n.reference_id:
                ci = db.query(ContentItem).filter(ContentItem.id == n.reference_id).first()
                if ci and ci.campaign_id != current_user.assigned_campaign_id:
                    continue
            scoped.append(n)
        return scoped

    return notifications


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as read, enforcing Agency campaign boundaries."""
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        return {"status": "not_found"}

    if current_user.role == UserRole.AGENCY:
        if not current_user.assigned_campaign_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Agency user has no assigned campaign"
            )
        if n.reference_type in ("content_item", "content_version") and n.reference_id:
            ci = db.query(ContentItem).filter(ContentItem.id == n.reference_id).first()
            if ci and ci.campaign_id != current_user.assigned_campaign_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Notification belongs to content outside assigned campaign"
                )

    n.is_read = True
    db.commit()
    return {"status": "read", "notification_id": notification_id}

