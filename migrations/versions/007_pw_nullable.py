"""Make hashed_password nullable for OAuth (Google) users

Revision ID: 007_pw_nullable
Revises: 006_accounts_brands_licenses
Create Date: 2026-02-20

Purpose: The users table was originally created with hashed_password NOT NULL.
         Google OAuth users have no password, so this must allow NULL.
"""
from alembic import op
import sqlalchemy as sa

revision = '007_pw_nullable'
down_revision = '006_accounts_brands_licenses'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'users',
        'hashed_password',
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    # WARNING: will fail if any NULL rows exist in hashed_password
    op.alter_column(
        'users',
        'hashed_password',
        existing_type=sa.String(),
        nullable=False,
    )
