"""Database schema migrations for BrandTrace."""

from sqlalchemy.engine import Engine
from app.db.migrations.m001_evidence_coordinates import upgrade as apply_m001


def run_schema_migrations(target_engine: Engine) -> None:
    """Apply all schema migrations idempotently for SQLite and PostgreSQL."""
    apply_m001(target_engine)

