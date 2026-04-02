"""Ensure clients.avatar_color exists (idempotent for DBs that skipped branch 015).

Revision ID: 058avacolifmissing
Revises: 057msadsagencyfields
Create Date: 2026-04-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "058avacolifmissing"
down_revision: Union[str, None] = "057msadsagencyfields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20)")
    )


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE clients DROP COLUMN IF EXISTS avatar_color"))
