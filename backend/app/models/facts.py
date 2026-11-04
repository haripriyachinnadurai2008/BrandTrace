import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class EvidenceSource(Base):
    __tablename__ = "evidence_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False, default="pdf")
    file_path = Column(String, nullable=True)
    file_hash = Column(String, nullable=True)
    excerpt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    organization = relationship("Organization", back_populates="sources")
    fact_versions = relationship("FactVersion", back_populates="source")

class BrandFact(Base):
    __tablename__ = "brand_facts"

    id = Column(String, primary_key=True)  # e.g., 'F001'
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., 'X1 Pro price'
    category = Column(String, nullable=False, default="Pricing")
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    organization = relationship("Organization", back_populates="facts")
    versions = relationship("FactVersion", back_populates="fact", cascade="all, delete-orphan", order_by="FactVersion.version_no.desc()")

class FactVersion(Base):
    __tablename__ = "fact_versions"

    version_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    fact_id = Column(String, ForeignKey("brand_facts.id", ondelete="CASCADE"), nullable=False)
    version_no = Column(Integer, nullable=False)
    value = Column(String, nullable=False)  # e.g. '₹4,999' or '₹5,499'
    unit = Column(String, nullable=False, default="INR")
    normalised_value = Column(String, nullable=False)  # e.g. '4999' or '5499'
    valid_from = Column(DateTime(timezone=True), nullable=False)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="approved")  # approved, draft, superseded
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    source_id = Column(String, ForeignKey("evidence_sources.id"), nullable=False)
    source_page = Column(Integer, nullable=False, default=1)
    supersedes_version_id = Column(String, ForeignKey("fact_versions.version_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    fact = relationship("BrandFact", back_populates="versions")
    source = relationship("EvidenceSource", back_populates="fact_versions")
    approver = relationship("User", foreign_keys=[approved_by])
    superseded_by = relationship("FactVersion", remote_side=[version_id], uselist=False)
    claim_links = relationship("ClaimFactLink", back_populates="fact_version")
    campaign_facts = relationship("CampaignFact", back_populates="fact_version")
