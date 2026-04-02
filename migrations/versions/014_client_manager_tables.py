"""Client Manager tables: client_account_groups, client_portal_settings

Revision ID: 014_client_manager_tables
Revises: 013_reddit_agency_columns
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa


revision = "014_client_manager_tables"
down_revision = "013_reddit_agency_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_account_groups",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column(
            "platform_account_id",
            sa.Integer(),
            sa.ForeignKey("platform_accounts.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    op.create_table(
        "client_portal_settings",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False, unique=True),
        sa.Column("portal_enabled", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("contact_email", sa.String(), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("portal_link_token", sa.String(), nullable=True),
        sa.Column("portal_link_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("use_per_platform_markup", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("global_markup_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("meta_markup_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("tiktok_markup_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("google_markup_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("show_kaivo_branding", sa.Boolean(), nullable=True),
        sa.Column("show_performance_score", sa.Boolean(), nullable=True),
        sa.Column("show_leaderboard", sa.Boolean(), nullable=True),
        sa.Column("show_trend_comparisons", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("client_portal_settings")
    op.drop_table("client_account_groups")

