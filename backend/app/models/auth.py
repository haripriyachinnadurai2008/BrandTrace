import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST
import enum

class UserRole(str, enum.Enum):
    ADMIN = "Admin"
    CREATOR = "Creator"
    REVIEWER = "Reviewer"
    AGENCY = "Agency"  # Read-only

def now_ist():
    return datetime.now(IST)

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    facts = relationship("BrandFact", back_populates="organization", cascade="all, delete-orphan")
    sources = relationship("EvidenceSource", back_populates="organization", cascade="all, delete-orphan")
    content_items = relationship("ContentItem", back_populates="organization", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="organization", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.CREATOR)
    assigned_campaign_id = Column(String, nullable=True)  # For Agency role filtering
    password_hash = Column(String, nullable=True)  # For production JWT login
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    organization = relationship("Organization", back_populates="users")
    content_items = relationship("ContentItem", back_populates="owner")
    reviews = relationship("Review", back_populates="reviewer")
    notifications = relationship("Notification", back_populates="user")
