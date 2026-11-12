"""
Migration 002: Add tables & columns for Precedent-to-Rule Synthesizer.

Tables ensured:
  - proposed_rules (id, title, description, suggested_policy_text, finding_type,
                    cluster_signature, status, created_at, decided_by, decided_at)
  - rule_precedents (id, rule_id, precedent_id, created_at)
  - guidelines (id, rule_id, title, finding_type, version, text, active, created_at)

Column ensured on existing table:
  - precedents.finding_type (VARCHAR, nullable)
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade(target_engine: Engine) -> list[str]:
    """Idempotently add precedent-to-rule tables and columns."""
    from app.models.governance import ProposedRule, RulePrecedent, Guideline

    inspector = inspect(target_engine)
    existing_tables = set(inspector.get_table_names())
    dialect = target_engine.dialect.name
    applied: list[str] = []

    if "precedents" in existing_tables:
        prec_cols = {c["name"] for c in inspector.get_columns("precedents")}
        if "finding_type" not in prec_cols:
            with target_engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text("ALTER TABLE precedents ADD COLUMN IF NOT EXISTS finding_type VARCHAR"))
                else:
                    conn.execute(text("ALTER TABLE precedents ADD COLUMN finding_type VARCHAR"))
            applied.append("precedents.finding_type")

    target_models = [ProposedRule.__table__, RulePrecedent.__table__, Guideline.__table__]
    for tbl in target_models:
        if tbl.name not in existing_tables:
            tbl.create(bind=target_engine, checkfirst=True)
            applied.append(tbl.name)

    return applied


if __name__ == "__main__":
    from app.database import get_active_engine

    eng = get_active_engine()
    res = upgrade(eng)
    print(f"[Migration 002] Applied: {res or 'none (already up to date)'}")

