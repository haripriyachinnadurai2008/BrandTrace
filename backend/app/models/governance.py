import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
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
    finding_type = Column(String, nullable=True, default="claim")
    resolution_action = Column(String, nullable=False)  # override, dismissed, accepted
    timestamp = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    rule = relationship("Rule", back_populates="precedents")
    finding = relationship("Finding", back_populates="precedents")
    reviewer = relationship("User")
    rule_links = relationship("RulePrecedent", back_populates="precedent", cascade="all, delete-orphan")


class ProposedRule(Base):
    __tablename__ = "proposed_rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    suggested_policy_text = Column(Text, nullable=False)
    finding_type = Column(String, nullable=False, default="claim")
    cluster_signature = Column(String, nullable=True)
    status = Column(String, nullable=False, default="proposed")  # proposed, approved, rejected
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)
    decided_by = Column(String, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    decider = relationship("User", foreign_keys=[decided_by])
    precedent_links = relationship("RulePrecedent", back_populates="proposed_rule", cascade="all, delete-orphan")
    guidelines = relationship(
        "Guideline",
        back_populates="proposed_rule",
        cascade="all, delete-orphan",
        order_by="Guideline.version.desc()",
    )


class RulePrecedent(Base):
    __tablename__ = "rule_precedents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, ForeignKey("proposed_rules.id", ondelete="CASCADE"), nullable=False)
    precedent_id = Column(String, ForeignKey("precedents.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    proposed_rule = relationship("ProposedRule", back_populates="precedent_links")
    precedent = relationship("Precedent", back_populates="rule_links")


class Guideline(Base):
    __tablename__ = "guidelines"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, ForeignKey("proposed_rules.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=True)
    finding_type = Column(String, nullable=True, default="claim")
    version = Column(Integer, nullable=False, default=1)
    text = Column(Text, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    proposed_rule = relationship("ProposedRule", back_populates="guidelines")

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


class SemanticConflict(Base):
    __tablename__ = "semantic_conflicts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    asset_a = Column(String, ForeignKey("content_items.id", ondelete="CASCADE"), nullable=False)
    asset_b = Column(String, ForeignKey("content_items.id", ondelete="CASCADE"), nullable=False)
    asset_a_title = Column(String, nullable=False)
    asset_b_title = Column(String, nullable=False)
    channel_a = Column(String, nullable=False)
    channel_b = Column(String, nullable=False)
    snippet_a = Column(Text, nullable=False)
    snippet_b = Column(Text, nullable=False)
    snippets = Column(JSON, nullable=False)  # {"snippet_a": "...", "snippet_b": "..."}
    reason = Column(Text, nullable=False)
    confidence = Column(Float, nullable=False, default=0.8)
    category = Column(String, nullable=False, default="claim")  # shipping, eligibility, duration, discount, claim
    status = Column(String, nullable=False, default="open")  # open, approved, dismissed
    fallback_used = Column(Boolean, nullable=False, default=False)
    decided_by = Column(String, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decision_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    campaign = relationship("Campaign")
    content_item_a = relationship("ContentItem", foreign_keys=[asset_a])
    content_item_b = relationship("ContentItem", foreign_keys=[asset_b])
    decider = relationship("User", foreign_keys=[decided_by])
