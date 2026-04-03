"""Google Ads agency OAuth + client linking columns

Revision ID: 059gadsagency
Revises: d36bc8a417ad
Create Date: 2026-04-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "059gadsagency"
down_revision: Union[str, None] = "d36bc8a417ad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("ALTER TABLE agencies ADD COLUMN IF NOT EXISTS google_ads_refresh_token TEXT")
    )
    op.execute(
        sa.text(
            "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS google_ads_connected_at TIMESTAMPTZ"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS google_ads_login_customer_id VARCHAR(20)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS agency_google_ads_customer_id VARCHAR(20)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_ads_account_status VARCHAR(30) DEFAULT 'agency_not_connected'"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_ads_account_name VARCHAR(255)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_ads_linked_at TIMESTAMPTZ"
        )
    )


def downgrade() -> None:
    op.drop_column("clients", "google_ads_linked_at")
    op.drop_column("clients", "google_ads_account_name")
    op.drop_column("clients", "google_ads_account_status")
    op.drop_column("clients", "agency_google_ads_customer_id")
    op.drop_column("agencies", "google_ads_login_customer_id")
    op.drop_column("agencies", "google_ads_connected_at")
    op.drop_column("agencies", "google_ads_refresh_token")
