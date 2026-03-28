"""Add credits column to brands table

Revision ID: 001_add_credits
Revises: 
Create Date: 2025-11-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import DECIMAL


# revision identifiers
revision = '001_add_credits'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Add credits column to brands table"""
    op.add_column('brands', sa.Column('credits', DECIMAL(10, 2), nullable=False, server_default='0.00'))


def downgrade():
    """Remove credits column from brands table"""
    op.drop_column('brands', 'credits')
