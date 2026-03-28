"""Sync DB schema with SQLAlchemy models (missing columns & tables)

Revision ID: 008_sync_schema
Revises: 007_pw_nullable
Create Date: 2026-02-20

Purpose:
  Several columns were added to SQLAlchemy models after the initial migration was
  written, so the live DB is missing them. This migration adds them idempotently
  using PostgreSQL DO blocks so repeated runs are safe.

Tables touched:
  - agencies    : updated_at, credits, billing_status
  - campaigns   : media_url, media_type
  - plans       : client_id, shopify_shop_domain, shopify_product_id, media_url, media_type

New tables:
  - subscriptions
  - platform_credentials
  - agency_invites
  - shopify_connections
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '008_sync_schema'
down_revision = '007_pw_nullable'
branch_labels = None
depends_on = None


def _add_col_if_missing(table: str, column: str, col_def: str) -> None:
    """Add a column only if it does not already exist."""
    op.execute(f"""
        DO $$ BEGIN
            ALTER TABLE {table} ADD COLUMN {column} {col_def};
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """)


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # agencies – missing: updated_at, credits, billing_status             #
    # ------------------------------------------------------------------ #
    _add_col_if_missing('agencies', 'updated_at',     'TIMESTAMP WITH TIME ZONE')
    _add_col_if_missing('agencies', 'credits',        'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
    _add_col_if_missing('agencies', 'billing_status', 'VARCHAR DEFAULT \'active\'')

    # ------------------------------------------------------------------ #
    # campaigns – missing: media_url, media_type                          #
    # ------------------------------------------------------------------ #
    _add_col_if_missing('campaigns', 'media_url',  'TEXT')
    _add_col_if_missing('campaigns', 'media_type', 'VARCHAR')

    # ------------------------------------------------------------------ #
    # plans – missing: client_id, shopify fields, media fields            #
    # ------------------------------------------------------------------ #
    _add_col_if_missing('plans', 'client_id',            'INTEGER REFERENCES clients(id)')
    _add_col_if_missing('plans', 'shopify_shop_domain',  'VARCHAR')
    _add_col_if_missing('plans', 'shopify_product_id',   'VARCHAR')
    _add_col_if_missing('plans', 'media_url',            'TEXT')
    _add_col_if_missing('plans', 'media_type',           'VARCHAR')

    # ------------------------------------------------------------------ #
    # subscriptions table                                                  #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id                      SERIAL PRIMARY KEY,
            agency_id               INTEGER NOT NULL REFERENCES agencies(id),
            stripe_subscription_id  VARCHAR(255) NOT NULL UNIQUE,
            stripe_customer_id      VARCHAR(255),
            plan_id                 VARCHAR(50)  NOT NULL,
            status                  VARCHAR(50)  NOT NULL,
            current_period_start    TIMESTAMP WITH TIME ZONE,
            current_period_end      TIMESTAMP WITH TIME ZONE,
            cancel_at_period_end    BOOLEAN DEFAULT FALSE,
            canceled_at             TIMESTAMP WITH TIME ZONE,
            created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_id        ON subscriptions(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_agency_id ON subscriptions(agency_id);")

    # ------------------------------------------------------------------ #
    # platform_credentials table                                          #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_credentials (
            id                      SERIAL PRIMARY KEY,
            account_id              INTEGER NOT NULL,
            platform                VARCHAR(50) NOT NULL,
            access_token_encrypted  TEXT,
            refresh_token_encrypted TEXT,
            app_id                  VARCHAR(255),
            app_secret_encrypted    TEXT,
            token_expires_at        TIMESTAMP WITH TIME ZONE,
            is_active               BOOLEAN DEFAULT TRUE,
            created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_credentials_id         ON platform_credentials(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_credentials_account_id ON platform_credentials(account_id);")

    # ------------------------------------------------------------------ #
    # agency_invites table                                                 #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE invitestatus AS ENUM ('pending', 'accepted', 'expired', 'revoked');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS agency_invites (
            id                  SERIAL PRIMARY KEY,
            agency_id           INTEGER NOT NULL REFERENCES agencies(id),
            email               VARCHAR NOT NULL,
            role                agencyrole DEFAULT 'VIEWER',
            token               VARCHAR NOT NULL UNIQUE,
            status              invitestatus DEFAULT 'pending',
            invited_by_user_id  INTEGER REFERENCES users(id),
            expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            accepted_at         TIMESTAMP WITH TIME ZONE
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_agency_invites_id       ON agency_invites(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agency_invites_email    ON agency_invites(email);")

    # ------------------------------------------------------------------ #
    # shopify_connections table                                            #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS shopify_connections (
            id           SERIAL PRIMARY KEY,
            shop_domain  VARCHAR NOT NULL UNIQUE,
            access_token VARCHAR NOT NULL,
            scope        VARCHAR,
            workspace_id VARCHAR,
            installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at   TIMESTAMP WITH TIME ZONE
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_shopify_connections_id          ON shopify_connections(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shopify_connections_shop_domain ON shopify_connections(shop_domain);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shopify_connections;")
    op.execute("DROP TABLE IF EXISTS agency_invites;")
    op.execute("DROP TABLE IF EXISTS platform_credentials;")
    op.execute("DROP TABLE IF EXISTS subscriptions;")

    # Remove added columns (ignore if they don't exist)
    for col in ('media_url', 'media_type', 'client_id',
                'shopify_shop_domain', 'shopify_product_id'):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE plans DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)
    for col in ('media_url', 'media_type'):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE campaigns DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)
    for col in ('updated_at', 'credits', 'billing_status'):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE agencies DROP COLUMN {col};
            EXCEPTION WHEN undefined_column THEN null; END $$;
        """)
