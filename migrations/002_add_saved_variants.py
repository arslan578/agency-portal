"""
Migration: Create saved_variants table

This table stores generated ad copy variants so users don't need to
regenerate (and re-spend OpenAI API credits) every time.
"""

UP = """
CREATE TABLE IF NOT EXISTS saved_variants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    brand_id INTEGER,
    brief TEXT NOT NULL,
    objective VARCHAR(50),
    target_lang VARCHAR(10) DEFAULT 'en',
    variants_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_variants_user_id ON saved_variants(user_id);
"""

DOWN = """
DROP TABLE IF EXISTS saved_variants;
"""
