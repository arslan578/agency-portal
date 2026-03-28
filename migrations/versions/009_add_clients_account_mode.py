"""Add clients.account_mode (align ORM with PostgreSQL)

Revision ID: 009_add_clients_account_mode
Revises: 008_sync_schema
Create Date: 2026-03-28

The SQLAlchemy Client model includes account_mode; older databases created from
earlier revisions never received this column, causing 500s on any Client query.
"""
from alembic import op


revision = "009_add_clients_account_mode"
down_revision = "008_sync_schema"
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
        "clients",
        "account_mode",
        "VARCHAR(20) NOT NULL DEFAULT 'kaivo_managed'",
    )


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE clients DROP COLUMN account_mode;
        EXCEPTION
            WHEN undefined_column THEN null;
        END $$;
    """)
