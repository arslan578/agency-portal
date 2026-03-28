"""add_user_columns

Revision ID: 5de017c69999
Revises: 4cacb7fbd509
Create Date: 2024-05-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5de017c69999'
down_revision = '4cacb7fbd509'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [col['name'] for col in inspector.get_columns('users')]
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('users')]

    if 'phone_number' not in existing_columns:
        op.add_column('users', sa.Column('phone_number', sa.String(), nullable=True))
    if 'company_name' not in existing_columns:
        op.add_column('users', sa.Column('company_name', sa.String(), nullable=True))
    if 'google_id' not in existing_columns:
        op.add_column('users', sa.Column('google_id', sa.String(), nullable=True))

    if 'ix_users_google_id' not in existing_indexes:
        op.create_index(op.f('ix_users_google_id'), 'users', ['google_id'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [col['name'] for col in inspector.get_columns('users')]
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('users')]

    if 'ix_users_google_id' in existing_indexes:
        op.drop_index(op.f('ix_users_google_id'), table_name='users')
    if 'google_id' in existing_columns:
        op.drop_column('users', 'google_id')
    if 'company_name' in existing_columns:
        op.drop_column('users', 'company_name')
    if 'phone_number' in existing_columns:
        op.drop_column('users', 'phone_number')
