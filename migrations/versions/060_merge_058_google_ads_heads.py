"""merge 058 avatar_color branch and 059 Google Ads agency branch

Revision ID: 060merge058gads
Revises: 058avacolifmissing, 059gadsagency
Create Date: 2026-04-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "060merge058gads"
down_revision: Union[str, None] = ("058avacolifmissing", "059gadsagency")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
