"""Database schema migrations for BrandTrace."""

from sqlalchemy.engine import Engine
from app.db.migrations.m001_evidence_coordinates import upgrade as apply_m001
from app.db.migrations.m002_precedent_rule_synthesizer import upgrade as apply_m002
from app.db.migrations.m003_semantic_conflicts import upgrade as apply_m003


def run_schema_migrations(target_engine: Engine) -> None:
    """Apply all schema migrations idempotently for SQLite and PostgreSQL."""
    apply_m001(target_engine)
    apply_m002(target_engine)
    apply_m003(target_engine)

