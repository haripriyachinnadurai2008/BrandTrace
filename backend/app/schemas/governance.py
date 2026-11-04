from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class AuditLogResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    actor_id: Optional[str]
    actor_role: Optional[str]
    old_values: Optional[Any] = None
    new_values: Optional[Any] = None
    reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class PrecedentResponse(BaseModel):
    id: str
    rule_id: Optional[str]
    finding_id: Optional[str]
    reviewer_id: str
    reason: str
    finding_summary: str
    resolution_action: str
    timestamp: datetime

    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    reference_id: Optional[str]
    reference_type: Optional[str]
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
