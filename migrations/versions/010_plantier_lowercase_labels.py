"""Align plantier enum with ORM (lowercase labels)

Revision ID: 010_plantier_values
Revises: 009_add_clients_account_mode, 009_magic_tokens
Create Date: 2026-03-28

SQLAlchemy Enum(PlanTier) was persisting member *names* (FREE). Many databases
use lowercase labels ('free', …) to match PlanTier.value and legacy SQL seeds.
This migration adds missing lowercase labels and normalizes existing rows that
still use UPPERCASE labels.
"""
from alembic import op

revision = "010_plantier_values"
down_revision = ("009_add_clients_account_mode", "009_magic_tokens")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # ADD VALUE must commit before new labels can appear in UPDATE/INSERT (PG safety).
    with op.get_context().autocommit_block():
        op.execute(
            """
            DO $$
            DECLARE
                lab text;
                labels text[] := ARRAY['free','starter','growth','scale','enterprise'];
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plantier') THEN
                    RETURN;
                END IF;
                FOREACH lab IN ARRAY labels
                LOOP
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_enum e
                        JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'plantier' AND e.enumlabel = lab
                    ) THEN
                        EXECUTE format('ALTER TYPE plantier ADD VALUE %L', lab);
                    END IF;
                END LOOP;
            END $$;
            """
        )

    pairs = [
        ("FREE", "free"),
        ("STARTER", "starter"),
        ("GROWTH", "growth"),
        ("SCALE", "scale"),
        ("ENTERPRISE", "enterprise"),
    ]
    for upper, lower in pairs:
        op.execute(
            f"""
            UPDATE agencies
            SET current_plan = '{lower}'::plantier
            WHERE current_plan::text = '{upper}';
            """
        )


def downgrade() -> None:
    pass
