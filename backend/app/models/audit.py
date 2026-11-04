import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON
from app.database import Base
from app.config import IST

def now_ist():
    return datetime.now(IST)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type = Column(String, nullable=False)  # fact, fact_version, content_item, content_version, finding
    entity_id = Column(String, nullable=False)
    action = Column(String, nullable=False)  # CREATE, VERSION_CHANGE, APPROVAL_INVALIDATED, RED_ALERT, STALE_MARKED, APPROVE, PUBLISH_STATUS
    actor_id = Column(String, nullable=True)
    actor_role = Column(String, nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist, nullable=False)
