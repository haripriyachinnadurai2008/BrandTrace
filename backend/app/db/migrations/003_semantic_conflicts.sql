-- Migration 003: Semantic Campaign Conflicts table (Improvement 2)

CREATE TABLE IF NOT EXISTS semantic_conflicts (
    id VARCHAR PRIMARY KEY,
    campaign_id VARCHAR NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    asset_a VARCHAR NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    asset_b VARCHAR NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    asset_a_title VARCHAR NOT NULL,
    asset_b_title VARCHAR NOT NULL,
    channel_a VARCHAR NOT NULL,
    channel_b VARCHAR NOT NULL,
    snippet_a TEXT NOT NULL,
    snippet_b TEXT NOT NULL,
    snippets JSONB NOT NULL,
    reason TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    category VARCHAR NOT NULL DEFAULT 'claim',
    status VARCHAR NOT NULL DEFAULT 'open',
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    decided_by VARCHAR REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

