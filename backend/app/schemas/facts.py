from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class FactVersionCreate(BaseModel):
    value: str = Field(..., description="Fact value, e.g. ₹5,499")
    unit: str = Field(default="INR", description="Unit of measurement")
    valid_from: datetime = Field(..., description="Effective start date/time (interpreted in Asia/Kolkata)")
    valid_to: Optional[datetime] = Field(None, description="Optional expiry date/time")
    source_id: str = Field(..., description="Evidence source ID")
    source_page: int = Field(default=1, description="Page number in the evidence document")
    reason: Optional[str] = Field("Annual pricing revision", description="Reason for version change")

class FactVersionResponse(BaseModel):
    version_id: str
    fact_id: str
    version_no: int
    value: str
    unit: str
    normalised_value: str
    valid_from: datetime
    valid_to: Optional[datetime]
    status: str
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    source_id: str
    source_page: int
    supersedes_version_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class BrandFactResponse(BaseModel):
    id: str
    name: str
    category: str
    created_at: datetime
    versions: List[FactVersionResponse] = []

    class Config:
        from_attributes = True

class ImpactItemResponse(BaseModel):
    content_id: str
    content_version_id: str
    title: str
    channel: str
    old_state: str
    new_state: str
    owner_name: str
    owner_email: str
    action_required: str  # 'Re-review required', 'Marked stale', 'RED ALERT', 'Left alone'
    is_red_alert: bool
    is_stale: bool
    is_re_review: bool
    is_left_alone: bool
    outdated_value: str
    new_value: str
    priority: str  # Critical, High, Medium, None

class FactImpactResponse(BaseModel):
    fact_id: str
    fact_name: str
    new_version_no: int
    new_value: str
    effective_from: datetime
    summary: dict  # counts: re_review, stale, red_alert, left_alone, total
    items: List[ImpactItemResponse]
