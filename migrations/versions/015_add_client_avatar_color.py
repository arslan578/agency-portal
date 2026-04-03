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
    # Idempotent: schema may already have avatar_color (e.g. sync / manual / 058 branch).
    op.execute(
        sa.text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20)")
    )


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE clients DROP COLUMN IF EXISTS avatar_color"))
