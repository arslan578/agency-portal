"""add tiktok agency/client fields

Revision ID: 056tiktokagencyfields
Revises: 0556478af300
Create Date: 2026-04-01 13:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "056tiktokagencyfields"
down_revision: Union[str, None] = "0556478af300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add TikTok OAuth fields on agencies and TikTok mapping fields on clients."""
    op.add_column(
        "agencies",
        sa.Column("tiktok_agency_access_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("tiktok_refresh_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("tiktok_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("tiktok_connected_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "clients",
        sa.Column("agency_tiktok_account_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("tiktok_account_status", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("tiktok_account_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("tiktok_linked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Drop TikTok fields if we roll back."""
    op.drop_column("clients", "tiktok_linked_at")
    op.drop_column("clients", "tiktok_account_name")
    op.drop_column("clients", "tiktok_account_status")
    op.drop_column("clients", "agency_tiktok_account_id")

    op.drop_column("agencies", "tiktok_connected_at")
    op.drop_column("agencies", "tiktok_token_expires_at")
    op.drop_column("agencies", "tiktok_refresh_token")
    op.drop_column("agencies", "tiktok_agency_access_token")

