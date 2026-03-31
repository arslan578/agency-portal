"""
Idempotent PostgreSQL DDL to match SQLAlchemy models.

Some environments never ran `migrations/meta_business_manager.sql` or a matching
Alembic revision; the ORM then fails on INSERT/SELECT. This module adds missing
columns and `audit_logs` using IF NOT EXISTS — safe to run repeatedly.
"""

from __future__ import annotations

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlalchemy.engine import Engine

# (table, column, SQL fragment after the column name)
_ORM_COLUMNS: list[tuple[str, str, str]] = [
    ("agencies", "updated_at", "TIMESTAMP WITH TIME ZONE"),
    ("agencies", "credits", "DECIMAL(10,2) NOT NULL DEFAULT 0.00"),
    ("agencies", "billing_status", "VARCHAR DEFAULT 'active'"),
    # Contact/profile fields
    ("agencies", "email", "VARCHAR DEFAULT NULL"),
    ("agencies", "logo_url", "VARCHAR DEFAULT NULL"),
    ("agencies", "website", "VARCHAR DEFAULT NULL"),
    ("agencies", "phone", "VARCHAR DEFAULT NULL"),
    ("agencies", "timezone", "VARCHAR DEFAULT NULL"),
    ("agencies", "currency", "VARCHAR(8) DEFAULT NULL"),
    ("agencies", "meta_business_manager_id", "VARCHAR(100) DEFAULT NULL"),
    ("agencies", "meta_business_manager_name", "VARCHAR(255) DEFAULT NULL"),
    ("agencies", "meta_agency_access_token", "TEXT DEFAULT NULL"),
    ("agencies", "meta_token_expires_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    ("agencies", "meta_connected_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    # Reddit agency OAuth columns added in ORM but may be missing in older DBs
    ("agencies", "reddit_agency_access_token", "TEXT DEFAULT NULL"),
    ("agencies", "reddit_refresh_token", "TEXT DEFAULT NULL"),
    ("agencies", "reddit_token_expires_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    ("agencies", "reddit_connected_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    ("clients", "account_mode", "VARCHAR(20) DEFAULT 'kaivo_managed'"),
    ("clients", "agency_meta_account_id", "VARCHAR(100) DEFAULT NULL"),
    ("clients", "meta_account_status", "VARCHAR(30) DEFAULT 'agency_not_connected'"),
    ("clients", "meta_account_name", "VARCHAR(255) DEFAULT NULL"),
    ("clients", "meta_linked_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    # Reddit client linking columns added later
    ("clients", "agency_reddit_account_id", "VARCHAR(100) DEFAULT NULL"),
    ("clients", "reddit_account_status", "VARCHAR(30) DEFAULT 'agency_not_connected'"),
    ("clients", "reddit_account_name", "VARCHAR(255) DEFAULT NULL"),
    ("clients", "reddit_linked_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
    ("users", "last_login_at", "TIMESTAMP WITH TIME ZONE DEFAULT NULL"),
]

_AUDIT_LOGS_DDL = """
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id),
    client_id INTEGER REFERENCES clients(id),
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
"""

_AUDIT_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);",
)

_ADD_PLANTIER_LABELS = """
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

_PLANTIER_NORMALIZE_PAIRS = (
    ("FREE", "free"),
    ("STARTER", "starter"),
    ("GROWTH", "growth"),
    ("SCALE", "scale"),
    ("ENTERPRISE", "enterprise"),
)

_ADD_AGENCYROLE_LABELS = """
DO $$
DECLARE
    lab text;
    labels text[] := ARRAY['agency_admin','agency_member','agency_viewer'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agencyrole') THEN
        RETURN;
    END IF;
    FOREACH lab IN ARRAY labels
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'agencyrole' AND e.enumlabel = lab
        ) THEN
            EXECUTE format('ALTER TYPE agencyrole ADD VALUE %L', lab);
        END IF;
    END LOOP;
END $$;
"""

_AGENCYROLE_NORMALIZE_PAIRS = (
    ("ADMIN", "agency_admin"),
    ("MEMBER", "agency_member"),
    ("VIEWER", "agency_viewer"),
)

_ADD_INVITESTATUS_LABELS = """
DO $$
DECLARE
    lab text;
    labels text[] := ARRAY['pending','accepted','expired','revoked'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitestatus') THEN
        RETURN;
    END IF;
    FOREACH lab IN ARRAY labels
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'invitestatus' AND e.enumlabel = lab
        ) THEN
            EXECUTE format('ALTER TYPE invitestatus ADD VALUE %L', lab);
        END IF;
    END LOOP;
END $$;
"""

_INVITESTATUS_NORMALIZE_PAIRS = (
    ("PENDING", "pending"),
    ("ACCEPTED", "accepted"),
    ("EXPIRED", "expired"),
    ("REVOKED", "revoked"),
)

_ADD_CLIENTROLE_LABELS = """
DO $$
DECLARE
    lab text;
    labels text[] := ARRAY['client_operator','client_viewer'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clientrole') THEN
        RETURN;
    END IF;
    FOREACH lab IN ARRAY labels
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'clientrole' AND e.enumlabel = lab
        ) THEN
            EXECUTE format('ALTER TYPE clientrole ADD VALUE %L', lab);
        END IF;
    END LOOP;
END $$;
"""

_CLIENTROLE_NORMALIZE_PAIRS = (
    ("OPERATOR", "client_operator"),
    ("VIEWER", "client_viewer"),
)


def _ensure_plantier_enum_aligned(engine: Engine) -> None:
    """Add lowercase plantier labels if missing, then normalize UPPERCASE rows.

    PostgreSQL requires new enum values to be committed before use; migration
    010 failed when ADD VALUE and UPDATE ran in one transaction. This runs the
    ADD block under AUTOCOMMIT, then UPDATE in a separate connection.
    """
    if engine.dialect.name != "postgresql":
        return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as ac:
        ac.execute(text("SET statement_timeout = '30s';"))
        ac.execute(text(_ADD_PLANTIER_LABELS))
        ac.execute(text("SET statement_timeout = '0';"))

    with engine.connect() as conn:
        conn.execute(text("SET statement_timeout = '15s';"))
        conn.execute(text("COMMIT;"))
        for upper, lower in _PLANTIER_NORMALIZE_PAIRS:
            conn.execute(
                text(
                    f"UPDATE agencies SET current_plan = '{lower}'::plantier "
                    f"WHERE current_plan::text = '{upper}';"
                )
            )
            conn.execute(text("COMMIT;"))
        conn.execute(text("SET statement_timeout = '0';"))
        conn.execute(text("COMMIT;"))


def _ensure_agencyrole_enum_aligned(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as ac:
        ac.execute(text("SET statement_timeout = '30s';"))
        ac.execute(text(_ADD_AGENCYROLE_LABELS))
        ac.execute(text("SET statement_timeout = '0';"))

    tables = set(sa_inspect(engine).get_table_names())
    with engine.connect() as conn:
        conn.execute(text("SET statement_timeout = '15s';"))
        conn.execute(text("COMMIT;"))
        for upper, lower in _AGENCYROLE_NORMALIZE_PAIRS:
            if "agency_memberships" in tables:
                conn.execute(
                    text(
                        f"UPDATE agency_memberships SET role = '{lower}'::agencyrole "
                        f"WHERE role::text = '{upper}';"
                    )
                )
                conn.execute(text("COMMIT;"))
            if "agency_invites" in tables:
                conn.execute(
                    text(
                        f"UPDATE agency_invites SET role = '{lower}'::agencyrole "
                        f"WHERE role::text = '{upper}';"
                    )
                )
                conn.execute(text("COMMIT;"))
            if "magic_tokens" in tables:
                conn.execute(
                    text(
                        f"UPDATE magic_tokens SET role = '{lower}'::agencyrole "
                        f"WHERE role::text = '{upper}';"
                    )
                )
                conn.execute(text("COMMIT;"))
        conn.execute(text("SET statement_timeout = '0';"))
        conn.execute(text("COMMIT;"))


def _ensure_invitestatus_enum_aligned(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.connect() as chk:
        if not chk.execute(
            text("SELECT 1 FROM pg_type WHERE typname = 'invitestatus' LIMIT 1")
        ).scalar():
            return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as ac:
        ac.execute(text("SET statement_timeout = '30s';"))
        ac.execute(text(_ADD_INVITESTATUS_LABELS))
        ac.execute(text("SET statement_timeout = '0';"))

    tables = set(sa_inspect(engine).get_table_names())
    if "agency_invites" not in tables:
        return

    with engine.connect() as conn:
        conn.execute(text("SET statement_timeout = '15s';"))
        conn.execute(text("COMMIT;"))
        for upper, lower in _INVITESTATUS_NORMALIZE_PAIRS:
            conn.execute(
                text(
                    f"UPDATE agency_invites SET status = '{lower}'::invitestatus "
                    f"WHERE status::text = '{upper}';"
                )
            )
            conn.execute(text("COMMIT;"))
        conn.execute(text("SET statement_timeout = '0';"))
        conn.execute(text("COMMIT;"))


def _ensure_clientrole_enum_aligned(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as ac:
        ac.execute(text("SET statement_timeout = '30s';"))
        ac.execute(text(_ADD_CLIENTROLE_LABELS))
        ac.execute(text("SET statement_timeout = '0';"))

    tables = set(sa_inspect(engine).get_table_names())
    if "client_memberships" not in tables:
        return

    with engine.connect() as conn:
        conn.execute(text("SET statement_timeout = '15s';"))
        conn.execute(text("COMMIT;"))
        for upper, lower in _CLIENTROLE_NORMALIZE_PAIRS:
            conn.execute(
                text(
                    f"UPDATE client_memberships SET role = '{lower}'::clientrole "
                    f"WHERE role::text = '{upper}';"
                )
            )
            conn.execute(text("COMMIT;"))
        conn.execute(text("SET statement_timeout = '0';"))
        conn.execute(text("COMMIT;"))


def ensure_orm_schema(engine: Engine) -> None:
    """Apply missing ORM columns and audit_logs. No-op for non-PostgreSQL engines."""
    if engine.dialect.name != "postgresql":
        return

    _ensure_plantier_enum_aligned(engine)
    _ensure_agencyrole_enum_aligned(engine)
    _ensure_invitestatus_enum_aligned(engine)
    _ensure_clientrole_enum_aligned(engine)

    with engine.connect() as conn:
        conn.execute(text("SET statement_timeout = '15s';"))
        conn.execute(text("COMMIT;"))
        for table, column, definition in _ORM_COLUMNS:
            conn.execute(
                text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition};"
                )
            )
            conn.execute(text("COMMIT;"))
        conn.execute(text(_AUDIT_LOGS_DDL))
        conn.execute(text("COMMIT;"))
        for stmt in _AUDIT_INDEXES:
            conn.execute(text(stmt))
            conn.execute(text("COMMIT;"))
        conn.execute(text("SET statement_timeout = '0';"))
        conn.execute(text("COMMIT;"))
