import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class ContentItem(Base):
    __tablename__ = "content_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(String, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    title = Column(String, nullable=False)
    channel = Column(String, nullable=False)  # linkedin, email, instagram, brochure, webinar
    current_state = Column(String, nullable=False, default="draft")  # draft, approved, live, archived, re-review required
    is_stale = Column(Boolean, nullable=False, default=False)
    is_red_alert = Column(Boolean, nullable=False, default=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    organization = relationship("Organization", back_populates="content_items")
    campaign = relationship("Campaign", back_populates="content_items")
    owner = relationship("User", back_populates="content_items")
    versions = relationship("ContentVersion", back_populates="content_item", cascade="all, delete-orphan", order_by="ContentVersion.version_no.desc()")

class ContentVersion(Base):
    __tablename__ = "content_versions"

    version_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_id = Column(String, ForeignKey("content_items.id", ondelete="CASCADE"), nullable=False)
    version_no = Column(Integer, nullable=False, default=1)
    raw_text = Column(Text, nullable=False)
    version_hash = Column(String, nullable=False)  # SHA-256
    state = Column(String, nullable=False, default="draft")  # draft, approved, live, archived, re-review required
    is_stale = Column(Boolean, nullable=False, default=False)
    is_red_alert = Column(Boolean, nullable=False, default=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    publish_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    content_item = relationship("ContentItem", back_populates="versions")
    claims = relationship("ExtractedClaim", back_populates="content_version", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="content_version", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="content_version", cascade="all, delete-orphan")
