"""Align agencyrole / invitestatus with ORM (.value labels)

Revision ID: 011_enum_orm_values
Revises: 010_plantier_values
Create Date: 2026-03-28

ORM Enum columns now persist Python Enum .value strings. Older DBs may still use
legacy PostgreSQL labels (ADMIN, PENDING, …). Add missing labels and rewrite rows.
"""
import sqlalchemy as sa
from alembic import op

revision = "011_enum_orm_values"
down_revision = "010_plantier_values"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    def add_enum_label(type_name: str, label: str) -> None:
        op.execute(
            f"""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = '{type_name}' AND e.enumlabel = '{label}'
                ) THEN
                    EXECUTE format('ALTER TYPE %I ADD VALUE %L', '{type_name}', '{label}');
                END IF;
            END $$;
            """
        )

    # ADD VALUE must commit before new labels are valid in UPDATE/INSERT.
    with op.get_context().autocommit_block():
        for lab in ("agency_admin", "agency_member", "agency_viewer"):
            add_enum_label("agencyrole", lab)
        if bind.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'invitestatus'")).scalar():
            for lab in ("pending", "accepted", "expired", "revoked"):
                add_enum_label("invitestatus", lab)

    role_map = [
        ("ADMIN", "agency_admin"),
        ("MEMBER", "agency_member"),
        ("VIEWER", "agency_viewer"),
    ]
    if "agency_memberships" in tables:
        for old, new in role_map:
            op.execute(
                f"UPDATE agency_memberships SET role = '{new}'::agencyrole WHERE role::text = '{old}';"
            )
    if "agency_invites" in tables:
        for old, new in role_map:
            op.execute(
                f"UPDATE agency_invites SET role = '{new}'::agencyrole WHERE role::text = '{old}';"
            )
    if "magic_tokens" in tables:
        for old, new in role_map:
            op.execute(
                f"UPDATE magic_tokens SET role = '{new}'::agencyrole WHERE role::text = '{old}';"
            )

    invite_map = [
        ("PENDING", "pending"),
        ("ACCEPTED", "accepted"),
        ("EXPIRED", "expired"),
        ("REVOKED", "revoked"),
    ]
    if bind.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'invitestatus'")).scalar():
        if "agency_invites" in tables:
            for old, new in invite_map:
                op.execute(
                    f"UPDATE agency_invites SET status = '{new}'::invitestatus WHERE status::text = '{old}';"
                )


def downgrade() -> None:
    pass
