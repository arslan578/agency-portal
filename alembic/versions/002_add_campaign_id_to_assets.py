"""Add campaign_id to creative_assets

Revision ID: 002_add_campaign_id_to_assets
Revises: 001_add_credits
Create Date: 2025-01-23

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_campaign_id_to_assets'
down_revision = '001_add_credits'
branch_labels = None
depends_on = None


def upgrade():
    # Add campaign_id column to creative_assets table
    op.add_column('creative_assets', sa.Column('campaign_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_creative_assets_campaign_id'), 'creative_assets', ['campaign_id'], unique=False)
    
    # Add foreign key constraint to campaigns table
    op.create_foreign_key(
        'fk_creative_assets_campaign_id',
        'creative_assets', 'campaigns',
        ['campaign_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade():
    # Remove foreign key constraint
    op.drop_constraint('fk_creative_assets_campaign_id', 'creative_assets', type_='foreignkey')
    
    # Remove index
    op.drop_index(op.f('ix_creative_assets_campaign_id'), table_name='creative_assets')
    
    # Remove column
    op.drop_column('creative_assets', 'campaign_id')
