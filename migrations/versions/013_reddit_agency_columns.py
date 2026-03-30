"""Reddit agency columns on agencies/clients.

Revision ID: 013_reddit_agency_columns
Revises: 012_meta_bm_columns
Create Date: 2026-03-30
"""
from alembic import op


revision = "013_reddit_agency_columns"
down_revision = "012_meta_bm_columns"
branch_labels = None
depends_on = None


def _add_col_if_missing(table: str, column: str, col_def: str) -> None:
    op.execute(f"""
        DO $$ BEGIN
            ALTER TABLE {table} ADD COLUMN {column} {col_def};
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """)


def upgrade() -> None:
    _add_col_if_missing(
        "agencies", "reddit_agency_access_token", "TEXT DEFAULT NULL"
    )
    _add_col_if_missing(
        "agencies", "reddit_refresh_token", "TEXT DEFAULT NULL"
    )
    _add_col_if_missing(
        "agencies",
        "reddit_token_expires_at",
        "TIMESTAMP WITH TIME ZONE DEFAULT NULL",
    )
    _add_col_if_missing(
        "agencies",
        "reddit_connected_at",
        "TIMESTAMP WITH TIME ZONE DEFAULT NULL",
    )

    _add_col_if_missing(
        "clients", "agency_reddit_account_id", "VARCHAR(100) DEFAULT NULL"
    )
    _add_col_if_missing(
        "clients",
        "reddit_account_status",
        "VARCHAR(30) DEFAULT 'agency_not_connected'",
    )
    _add_col_if_missing(
        "clients", "reddit_account_name", "VARCHAR(255) DEFAULT NULL"
    )
    _add_col_if_missing(
        "clients", "reddit_linked_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"
    )


def downgrade() -> None:
    for col in (
        "reddit_linked_at",
        "reddit_account_name",
        "reddit_account_status",
        "agency_reddit_account_id",
    ):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE clients DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)

    for col in (
        "reddit_connected_at",
        "reddit_token_expires_at",
        "reddit_refresh_token",
        "reddit_agency_access_token",
    ):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE agencies DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)
