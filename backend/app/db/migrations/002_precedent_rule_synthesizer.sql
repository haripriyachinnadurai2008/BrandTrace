-- Migration 002: Add Precedent-to-Rule Synthesizer tables and columns

ALTER TABLE precedents ADD COLUMN IF NOT EXISTS finding_type VARCHAR;

CREATE TABLE IF NOT EXISTS proposed_rules (
    id VARCHAR PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT NOT NULL,
    suggested_policy_text TEXT NOT NULL,
    finding_type VARCHAR NOT NULL DEFAULT 'claim',
    cluster_signature VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'proposed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by VARCHAR REFERENCES users(id),
    decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rule_precedents (
    id VARCHAR PRIMARY KEY,
    rule_id VARCHAR NOT NULL REFERENCES proposed_rules(id) ON DELETE CASCADE,
    precedent_id VARCHAR NOT NULL REFERENCES precedents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guidelines (
    id VARCHAR PRIMARY KEY,
    rule_id VARCHAR NOT NULL REFERENCES proposed_rules(id) ON DELETE CASCADE,
    title VARCHAR,
    finding_type VARCHAR DEFAULT 'claim',
    version INTEGER NOT NULL DEFAULT 1,
    text TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

