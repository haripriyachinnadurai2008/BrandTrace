"""
Migration 003: Add semantic_conflicts table for Semantic Campaign Conflict Detection.
"""

from sqlalchemy import inspect
from sqlalchemy.engine import Engine


def upgrade(target_engine: Engine) -> list[str]:
    """Idempotently create the semantic_conflicts table."""
    from app.models.governance import SemanticConflict

    inspector = inspect(target_engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []

    tbl = SemanticConflict.__table__
    if tbl.name not in existing_tables:
        tbl.create(bind=target_engine, checkfirst=True)
        applied.append(tbl.name)

    return applied

