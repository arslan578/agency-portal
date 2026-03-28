"""Add accounts, brands, and licenses tables

Revision ID: 006_accounts_brands_licenses
Revises: 5de017c69999
Create Date: 2025-01-25

Purpose: Support Account Service tables for user-account relationships.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '006_accounts_brands_licenses'
down_revision = '5de017c69999'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create TierEnum type if not exists (for accounts table)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE tierenum AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    # Create RoleEnum type if not exists (for licenses table)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE roleenum AS ENUM ('owner', 'manager', 'analyst', 'billing');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    # Create accounts table
    op.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            tier tierenum DEFAULT 'FREE',
            monthly_spend DECIMAL(10, 2) DEFAULT 0.00,
            billing_status VARCHAR(50) DEFAULT 'active',
            parent_account_id INTEGER REFERENCES accounts(id),
            address TEXT
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_id ON accounts(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_name ON accounts(name);")
    # Create brands table
    op.execute("""
        CREATE TABLE IF NOT EXISTS brands (
            id SERIAL PRIMARY KEY,
            account_id INTEGER REFERENCES accounts(id),
            name VARCHAR(255),
            sector VARCHAR(255),
            logo_url VARCHAR(500),
            credits DECIMAL(10, 2) DEFAULT 0.00
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_brands_account_id ON brands(account_id);")
    # Create licenses table
    op.execute("""
        CREATE TABLE IF NOT EXISTS licenses (
            id SERIAL PRIMARY KEY,
            account_id INTEGER REFERENCES accounts(id),
            user_id INTEGER,
            role roleenum DEFAULT 'owner'
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_licenses_id ON licenses(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_licenses_account_id ON licenses(account_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_licenses_user_id ON licenses(user_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS licenses;")
    op.execute("DROP TABLE IF EXISTS brands;")
    op.execute("DROP TABLE IF EXISTS accounts;")
    op.execute("DROP TYPE IF EXISTS roleenum;")
    op.execute("DROP TYPE IF EXISTS tierenum;")
