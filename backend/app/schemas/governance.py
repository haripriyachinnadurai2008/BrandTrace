from pydantic import BaseModel
from typing import Optional, Any, List
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
    finding_type: Optional[str] = None
    resolution_action: str
    timestamp: datetime

    class Config:
        from_attributes = True


class GuidelineResponse(BaseModel):
    id: str
    rule_id: str
    title: Optional[str] = None
    finding_type: Optional[str] = None
    version: int
    text: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProposedRuleResponse(BaseModel):
    id: str
    title: str
    description: str
    suggested_policy_text: str
    finding_type: str
    status: str
    created_at: datetime
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    supporting_precedents: List[PrecedentResponse] = []
    guidelines: List[GuidelineResponse] = []


class RuleDecisionRequest(BaseModel):
    policy_text: Optional[str] = None
    reason: Optional[str] = None

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
