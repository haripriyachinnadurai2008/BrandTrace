# Import all models so SQLAlchemy mapper is fully populated before create_all().
from app.models.auth import Organization, User, UserRole  # noqa: F401
from app.models.facts import EvidenceSource, BrandFact, FactVersion  # noqa: F401
from app.models.campaign import Campaign, CampaignFact  # noqa: F401
from app.models.content import ContentItem, ContentVersion  # noqa: F401
from app.models.claims import ExtractedClaim, ClaimFactLink, Finding  # noqa: F401
from app.models.governance import (  # noqa: F401
    Review,
    Notification,
    Rule,
    Precedent,
    ProposedRule,
    RulePrecedent,
    Guideline,
    ExternalCallsLog,
    SemanticConflict,
)
from app.models.audit import AuditLog  # noqa: F401
