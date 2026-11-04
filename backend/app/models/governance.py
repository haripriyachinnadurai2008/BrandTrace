import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class Review(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_version_id = Column(String, ForeignKey("content_versions.version_id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # approved, rejected, override
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    content_version = relationship("ContentVersion", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)  # re_review_required, red_alert, stale_draft, info
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    reference_id = Column(String, nullable=True)
    reference_type = Column(String, nullable=True)  # content_item, fact_version, etc.
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    user = relationship("User", back_populates="notifications")

class Rule(Base):
    __tablename__ = "rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String, nullable=False, default="Medium")
    rule_type = Column(String, nullable=False, default="governance")
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    precedents = relationship("Precedent", back_populates="rule")

class Precedent(Base):
    __tablename__ = "precedents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, ForeignKey("rules.id", ondelete="SET NULL"), nullable=True)
    finding_id = Column(String, ForeignKey("findings.id", ondelete="SET NULL"), nullable=True)
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)
    finding_summary = Column(Text, nullable=False)
    resolution_action = Column(String, nullable=False)  # override, dismissed, accepted
    timestamp = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    rule = relationship("Rule", back_populates="precedents")
    finding = relationship("Finding", back_populates="precedents")
    reviewer = relationship("User")

class ExternalCallsLog(Base):
    __tablename__ = "external_calls_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    service_name = Column(String, nullable=False)  # groq, cached_fallback
    endpoint = Column(String, nullable=False)
    latency_ms = Column(Integer, nullable=False, default=0)
    status_code = Column(Integer, nullable=False, default=200)
    request_payload = Column(Text, nullable=True)
    response_payload = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)
