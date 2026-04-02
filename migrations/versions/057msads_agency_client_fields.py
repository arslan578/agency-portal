"""add microsoft ads agency/client fields

Revision ID: 057msadsagencyfields
Revises: 056tiktokagencyfields
Create Date: 2026-04-01 13:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "057msadsagencyfields"
down_revision: Union[str, None] = "056tiktokagencyfields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Microsoft Ads OAuth fields on agencies and mapping fields on clients."""
    op.add_column(
        "agencies",
        sa.Column("microsoft_agency_access_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("microsoft_refresh_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("microsoft_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "agencies",
        sa.Column("microsoft_connected_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "clients",
        sa.Column("agency_microsoft_account_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("microsoft_account_status", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("microsoft_account_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("microsoft_linked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Drop Microsoft Ads fields if we roll back."""
    op.drop_column("clients", "microsoft_linked_at")
    op.drop_column("clients", "microsoft_account_name")
    op.drop_column("clients", "microsoft_account_status")
    op.drop_column("clients", "agency_microsoft_account_id")

    op.drop_column("agencies", "microsoft_connected_at")
    op.drop_column("agencies", "microsoft_token_expires_at")
    op.drop_column("agencies", "microsoft_refresh_token")
    op.drop_column("agencies", "microsoft_agency_access_token")

