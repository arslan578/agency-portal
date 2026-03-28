"""
Idempotent DDL for admin / magic-link features.

GET /admin/invites queries `magic_tokens`. If the table is missing (Alembic 009
not applied), the API returns 500 — unrelated to Resend.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_DDL = """
CREATE TABLE IF NOT EXISTS magic_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR NOT NULL UNIQUE,
    email VARCHAR NOT NULL,
    role VARCHAR(32),
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
"""
_IDX_TOKEN = "CREATE INDEX IF NOT EXISTS ix_magic_tokens_token ON magic_tokens (token);"
_IDX_EMAIL = "CREATE INDEX IF NOT EXISTS ix_magic_tokens_email ON magic_tokens (email);"


def ensure_magic_tokens_table(engine: Engine) -> None:
    """Create magic_tokens if missing. Cheap no-op when the table already exists."""
    try:
        with engine.begin() as conn:
            conn.execute(text(_DDL))
            conn.execute(text(_IDX_TOKEN))
            conn.execute(text(_IDX_EMAIL))
    except Exception:
        logger.exception("ensure_magic_tokens_table failed")
        raise
