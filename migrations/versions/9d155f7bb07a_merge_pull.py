"""merge pull

Revision ID: 9d155f7bb07a
Revises: 015_add_client_avatar_color, 058avacolifmissing
Create Date: 2026-04-02 22:44:10.214191
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9d155f7bb07a'
down_revision: Union[str, None] = ('015_add_client_avatar_color', '058avacolifmissing')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

