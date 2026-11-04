from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UserResponse(BaseModel):
    id: str
    org_id: str
    name: str
    email: str
    role: str
    assigned_campaign_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserPublicResponse(BaseModel):
    """Non-sensitive public profile directory listing."""
    id: str
    name: str
    role: str
    assigned_campaign_id: Optional[str] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublicResponse
