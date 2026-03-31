from __future__ import annotations

"""
Idempotent migration script to align the `agencies` table with the Agency ORM model.

Adds the following nullable columns if they do not already exist:
- reddit_agency_access_token TEXT
- reddit_refresh_token TEXT
- reddit_token_expires_at TIMESTAMPTZ
- reddit_connected_at TIMESTAMPTZ

Usage (from repo root, with DATABASE_URL configured):

    python scripts/migrate_add_reddit_columns_agencies.py
"""

from sqlalchemy import text

from packages.db.database import engine


DDL_STATEMENTS = [
    """
    ALTER TABLE agencies
    ADD COLUMN IF NOT EXISTS reddit_agency_access_token TEXT NULL
    """,
    """
    ALTER TABLE agencies
    ADD COLUMN IF NOT EXISTS reddit_refresh_token TEXT NULL
    """,
    """
    ALTER TABLE agencies
    ADD COLUMN IF NOT EXISTS reddit_token_expires_at TIMESTAMPTZ NULL
    """,
    """
    ALTER TABLE agencies
    ADD COLUMN IF NOT EXISTS reddit_connected_at TIMESTAMPTZ NULL
    """,
]


def run_migration() -> None:
    with engine.begin() as conn:
        for ddl in DDL_STATEMENTS:
            conn.execute(text(ddl))


if __name__ == "__main__":
    run_migration()
    print("Migration complete: reddit_* columns ensured on agencies table.")

