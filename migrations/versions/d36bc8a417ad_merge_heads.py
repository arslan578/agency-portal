"""merge heads

Revision ID: d36bc8a417ad
Revises: 015_add_client_avatar_color, 056tiktokagencyfields
Create Date: 2026-04-02 19:05:55.846570
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd36bc8a417ad'
down_revision: Union[str, None] = ('015_add_client_avatar_color', '056tiktokagencyfields')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

