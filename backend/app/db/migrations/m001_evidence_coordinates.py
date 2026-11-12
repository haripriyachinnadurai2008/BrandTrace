"""
Migration 001: Add PDF evidence deep-linking columns to extracted_claims.

Columns added:
  - evidence_document_id (VARCHAR / TEXT, nullable)
  - evidence_page (INTEGER, nullable)
  - evidence_rects (JSON, nullable)
  - evidence_page_width (FLOAT, nullable)
  - evidence_page_height (FLOAT, nullable)
  - evidence_located (BOOLEAN, nullable)
  - evidence_reason (TEXT, nullable)
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


EVIDENCE_COLUMNS = [
    ("evidence_document_id", "VARCHAR", "VARCHAR"),
    ("evidence_page", "INTEGER", "INTEGER"),
    ("evidence_rects", "JSON", "JSON"),
    ("evidence_page_width", "FLOAT", "DOUBLE PRECISION"),
    ("evidence_page_height", "FLOAT", "DOUBLE PRECISION"),
    ("evidence_located", "BOOLEAN", "BOOLEAN"),
    ("evidence_reason", "TEXT", "TEXT"),
]


def upgrade(target_engine: Engine) -> list[str]:
    """Idempotently add PDF evidence coordinate columns to extracted_claims."""
    inspector = inspect(target_engine)
    if "extracted_claims" not in inspector.get_table_names():
        return []

    existing = {col["name"] for col in inspector.get_columns("extracted_claims")}
    dialect = target_engine.dialect.name
    added: list[str] = []

    with target_engine.begin() as conn:
        for col_name, sqlite_type, pg_type in EVIDENCE_COLUMNS:
            if col_name in existing:
                continue
            col_type = pg_type if dialect == "postgresql" else sqlite_type
            if dialect == "postgresql":
                conn.execute(
                    text(f"ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
                )
            else:
                conn.execute(
                    text(f"ALTER TABLE extracted_claims ADD COLUMN {col_name} {col_type}")
                )
            added.append(col_name)
    return added


if __name__ == "__main__":
    from app.database import get_active_engine

    eng = get_active_engine()
    added_cols = upgrade(eng)
    print(f"[Migration 001] Added columns: {added_cols or 'none (already up to date)'}")

