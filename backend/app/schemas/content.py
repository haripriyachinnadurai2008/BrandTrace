from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class PublishStatusRequest(BaseModel):
    state: str = Field(..., description="Target state: 'live' or 'archived'")
    publish_url: Optional[str] = Field(None, description="Public URL where content is live")
    published_at: Optional[datetime] = Field(None, description="Date/time when published")
    archived_at: Optional[datetime] = Field(None, description="Date/time when archived")

class ApproveRequest(BaseModel):
    reason: str = Field(default="Standard editorial review passed", description="Reviewer rationale")

class ContentVersionSummary(BaseModel):
    version_id: str
    version_no: int
    state: str
    approved_at: Optional[datetime]
    published_at: Optional[datetime]
    archived_at: Optional[datetime]
    publish_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class ContentItemResponse(BaseModel):
    id: str
    title: str
    channel: str
    current_state: str
    owner_id: str
    campaign_id: Optional[str]
    created_at: datetime
    current_version: Optional[ContentVersionSummary] = None

    class Config:
        from_attributes = True
