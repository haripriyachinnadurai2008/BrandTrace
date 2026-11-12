-- Migration 001: Add PDF evidence coordinate columns to extracted_claims
-- Compatible with PostgreSQL; SQLite migrations are handled idempotently via m001_evidence_coordinates.py

ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_document_id VARCHAR;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_page INTEGER;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_rects JSON;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_page_width DOUBLE PRECISION;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_page_height DOUBLE PRECISION;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_located BOOLEAN;
ALTER TABLE extracted_claims ADD COLUMN IF NOT EXISTS evidence_reason TEXT;

