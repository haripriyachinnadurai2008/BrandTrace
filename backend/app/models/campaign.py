import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., 'Festive Launch'
    description = Column(Text, nullable=True)
    approved_offer = Column(String, nullable=True)  # e.g., '20% off launch discount' or '₹4,999'
    declared_products = Column(String, nullable=True)  # e.g. '["X1 Pro"]' or comma-separated
    status = Column(String, nullable=False, default="active")  # active, completed, draft
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    organization = relationship("Organization", back_populates="campaigns")
    content_items = relationship("ContentItem", back_populates="campaign")
    campaign_facts = relationship("CampaignFact", back_populates="campaign", cascade="all, delete-orphan")

    def get_declared_products(self) -> list[str]:
        """Returns list of declared product names for this campaign."""
        if self.declared_products:
            try:
                import json
                val = json.loads(self.declared_products)
                if isinstance(val, list):
                    return [str(p).strip() for p in val if str(p).strip()]
            except Exception:
                return [p.strip() for p in self.declared_products.split(",") if p.strip()]

        # Fallback to products from campaign_facts -> fact_version -> brand_fact.name
        prods = []
        if self.campaign_facts:
            for cf in self.campaign_facts:
                if cf.fact_version and cf.fact_version.fact:
                    name = cf.fact_version.fact.name
                    # E.g. 'X1 Pro price' -> 'X1 Pro'
                    cleaned = name.lower()
                    for suffix in [" price", " offer", " specifications", " specs"]:
                        if cleaned.endswith(suffix):
                            name = name[:len(name) - len(suffix)].strip()
                            break
                    if name and name not in prods:
                        prods.append(name)
        return prods

class CampaignFact(Base):
    __tablename__ = "campaign_facts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    fact_version_id = Column(String, ForeignKey("fact_versions.version_id", ondelete="CASCADE"), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)

    campaign = relationship("Campaign", back_populates="campaign_facts")
    fact_version = relationship("FactVersion", back_populates="campaign_facts")
