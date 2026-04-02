"""Add avatar_color column to clients table

Revision ID: 015_add_client_avatar_color
Revises: 014_client_manager_tables
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


revision = "015_add_client_avatar_color"
down_revision = "014_client_manager_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("avatar_color", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "avatar_color")
