"""
Audit log append-only trigger test (SQLite-compatible).
Uses the SQLite BEFORE trigger created in conftest.py.
"""
import uuid
import pytest
from datetime import datetime
from sqlalchemy import text
from app.models.audit import AuditLog
from app.config import IST


def test_audit_insert_allowed(db_session):
    """INSERT into audit_logs must succeed."""
    db = db_session
    entry = AuditLog(
        id=str(uuid.uuid4()),
        entity_type="fact",
        entity_id="F001",
        action="CREATE",
        actor_id="usr_admin_elena",
        actor_role="Admin",
        reason="Trigger test: insert allowed",
        created_at=datetime.now(IST),
    )
    db.add(entry)
    db.commit()
    saved = db.query(AuditLog).filter(AuditLog.id == entry.id).first()
    assert saved is not None
    assert saved.action == "CREATE"


def test_audit_update_blocked(db_engine, db_session):
    """UPDATE on audit_logs must be blocked by trigger."""
    db = db_session
    entry_id = str(uuid.uuid4())
    db.add(AuditLog(
        id=entry_id, entity_type="fact", entity_id="F001", action="ORIGINAL",
        actor_id="usr_admin_elena", actor_role="Admin",
        reason="Before update attempt", created_at=datetime.now(IST),
    ))
    db.commit()

    blocked = False
    try:
        db.execute(text(f"UPDATE audit_logs SET action = 'MUTATED' WHERE id = '{entry_id}'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        blocked = True
        msg = str(exc).lower()
        assert "append-only" in msg or "prohibited" in msg or "abort" in msg

    assert blocked, "DB trigger must block UPDATE on audit_logs"

    # Record is still intact
    still = db.query(AuditLog).filter(AuditLog.id == entry_id).first()
    assert still is not None
    assert still.action == "ORIGINAL"


def test_audit_delete_blocked(db_engine, db_session):
    """DELETE on audit_logs must be blocked by trigger."""
    db = db_session
    entry_id = str(uuid.uuid4())
    db.add(AuditLog(
        id=entry_id, entity_type="fact", entity_id="F001", action="TO_DELETE",
        actor_id="usr_admin_elena", actor_role="Admin",
        reason="Before delete attempt", created_at=datetime.now(IST),
    ))
    db.commit()

    blocked = False
    try:
        db.execute(text(f"DELETE FROM audit_logs WHERE id = '{entry_id}'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        blocked = True
        msg = str(exc).lower()
        assert "append-only" in msg or "prohibited" in msg or "abort" in msg

    assert blocked, "DB trigger must block DELETE on audit_logs"

    still = db.query(AuditLog).filter(AuditLog.id == entry_id).first()
    assert still is not None
