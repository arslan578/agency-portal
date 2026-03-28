"""Add magic_tokens table and last_login_at column to users

Revision ID: 009_magic_tokens
Revises: 008_sync_schema
Create Date: 2026-03-28

Purpose:
  Adds the magic_tokens table for passwordless invite authentication
  and last_login_at column to users table for login tracking.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '009_magic_tokens'
down_revision = '008_sync_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # Add last_login_at to users if missing
    if 'users' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('users')]
        if 'last_login_at' not in existing_columns:
            op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))

    # Create magic_tokens table if missing
    # Use existing 'agencyrole' enum type — DO NOT recreate it
    if 'magic_tokens' not in existing_tables:
        agencyrole_enum = postgresql.ENUM(
            'agency_admin', 'agency_member', 'agency_viewer',
            name='agencyrole', create_type=False,
        )
        op.create_table(
            'magic_tokens',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('token', sa.String(), nullable=False, unique=True, index=True),
            sa.Column('email', sa.String(), nullable=False, index=True),
            sa.Column('role', agencyrole_enum, nullable=True),
            sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('invited_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'magic_tokens' in existing_tables:
        op.drop_table('magic_tokens')

    if 'users' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('users')]
        if 'last_login_at' in existing_columns:
            op.drop_column('users', 'last_login_at')
