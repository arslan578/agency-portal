"""Create ai_insights table (matches packages.db.models.AIInsight)

Revision ID: 061aiinsights
Revises: 060merge058gads
Create Date: 2026-04-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "061aiinsights"
down_revision: Union[str, None] = "060merge058gads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS ai_insights (
                id VARCHAR NOT NULL,
                agency_id INTEGER NOT NULL REFERENCES agencies(id),
                client_id INTEGER NOT NULL REFERENCES clients(id),
                platform VARCHAR,
                platform_label VARCHAR,
                severity VARCHAR NOT NULL,
                categories JSON,
                title VARCHAR(120) NOT NULL,
                description VARCHAR(400),
                impact_metrics JSON,
                apply_label VARCHAR,
                review_label VARCHAR,
                review_url VARCHAR,
                icon VARCHAR,
                accent_color VARCHAR,
                icon_bg VARCHAR,
                status VARCHAR DEFAULT 'pending',
                action_taken TEXT,
                priority_score DOUBLE PRECISION DEFAULT 0.5,
                recoverable_spend_cents INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ,
                PRIMARY KEY (id)
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_ai_insights_client_id ON ai_insights (client_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_ai_insights_agency_id ON ai_insights (agency_id)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS ai_insights"))
