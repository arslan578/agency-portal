"""Meta Business Manager columns on agencies/clients; audit_logs table

Revision ID: 012_meta_bm_columns
Revises: 011_enum_orm_values
Create Date: 2026-03-29

Adds columns expected by packages.db.models.Agency and Client for Meta BM,
and creates audit_logs if missing (idempotent duplicate_column handling).
"""
from alembic import op


revision = "012_meta_bm_columns"
down_revision = "011_enum_orm_values"
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
        "agencies", "meta_business_manager_id", "VARCHAR(100) DEFAULT NULL"
    )
    _add_col_if_missing(
        "agencies", "meta_business_manager_name", "VARCHAR(255) DEFAULT NULL"
    )
    _add_col_if_missing(
        "agencies", "meta_agency_access_token", "TEXT DEFAULT NULL"
    )
    _add_col_if_missing(
        "agencies",
        "meta_token_expires_at",
        "TIMESTAMP WITH TIME ZONE DEFAULT NULL",
    )
    _add_col_if_missing(
        "agencies",
        "meta_connected_at",
        "TIMESTAMP WITH TIME ZONE DEFAULT NULL",
    )

    _add_col_if_missing(
        "clients", "agency_meta_account_id", "VARCHAR(100) DEFAULT NULL"
    )
    _add_col_if_missing(
        "clients",
        "meta_account_status",
        "VARCHAR(30) DEFAULT 'agency_not_connected'",
    )
    _add_col_if_missing(
        "clients", "meta_account_name", "VARCHAR(255) DEFAULT NULL"
    )
    _add_col_if_missing(
        "clients", "meta_linked_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            agency_id INTEGER REFERENCES agencies(id),
            client_id INTEGER REFERENCES clients(id),
            user_id INTEGER REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs;")

    for col in (
        "meta_linked_at",
        "meta_account_name",
        "meta_account_status",
        "agency_meta_account_id",
    ):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE clients DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)

    for col in (
        "meta_connected_at",
        "meta_token_expires_at",
        "meta_agency_access_token",
        "meta_business_manager_name",
        "meta_business_manager_id",
    ):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE agencies DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)
