import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class ExtractedClaim(Base):
    __tablename__ = "extracted_claims"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_version_id = Column(String, ForeignKey("content_versions.version_id", ondelete="CASCADE"), nullable=False)
    raw_span_text = Column(String, nullable=False)
    normalised_value = Column(String, nullable=False)
    value_type = Column(String, nullable=False, default="text")  # price, date, percentage, text
    is_approximate = Column(Boolean, nullable=False, default=False)
    subject = Column(String, nullable=True)
    attribute = Column(String, nullable=True)
    span_start = Column(Integer, nullable=False, default=0)
    span_end = Column(Integer, nullable=False, default=0)
    extraction_confidence = Column(Float, nullable=False, default=1.0)
    masked_token = Column(String, nullable=True)  # e.g., '[PRICE_1]'
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    content_version = relationship("ContentVersion", back_populates="claims")
    claim_fact_links = relationship("ClaimFactLink", back_populates="claim", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="claim", cascade="all, delete-orphan")

class ClaimFactLink(Base):
    __tablename__ = "claim_fact_links"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    claim_id = Column(String, ForeignKey("extracted_claims.id", ondelete="CASCADE"), nullable=False)
    fact_version_id = Column(String, ForeignKey("fact_versions.version_id", ondelete="CASCADE"), nullable=False)
    similarity_score = Column(Float, nullable=False, default=1.0)
    link_type = Column(String, nullable=False, default="auto")  # auto, llm_assisted, manual
    status = Column(String, nullable=False, default="verified")  # verified, contradicted, unverified, stale
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    claim = relationship("ExtractedClaim", back_populates="claim_fact_links")
    fact_version = relationship("FactVersion", back_populates="claim_links")

class Finding(Base):
    __tablename__ = "findings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_version_id = Column(String, ForeignKey("content_versions.version_id", ondelete="CASCADE"), nullable=False)
    claim_id = Column(String, ForeignKey("extracted_claims.id", ondelete="CASCADE"), nullable=False)
    risk_tier = Column(String, nullable=False)  # Critical, High, Medium, Info
    reason = Column(Text, nullable=False)
    source_reference = Column(String, nullable=False)
    extraction_confidence = Column(Float, nullable=False, default=1.0)
    status = Column(String, nullable=False, default="open")  # open, resolved, overridden, dismissed
    fix_options = Column(JSON, nullable=True)  # {professional, marketing, minimal}
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    content_version = relationship("ContentVersion", back_populates="findings")
    claim = relationship("ExtractedClaim", back_populates="findings")
    precedents = relationship("Precedent", back_populates="finding")
