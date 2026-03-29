#!/usr/bin/env python3
"""
Interactive superuser bootstrap for Kaivo (PostgreSQL).

Loads DATABASE_URL from the project root .env, prompts for credentials,
auto-applies any missing schema columns, then creates or upgrades a user
with is_superuser=True and ensures agency + default client.

Usage (from repo root, venv active):
    python scripts/create_superuser.py
"""

from __future__ import annotations

import argparse
import re
import sys
from getpass import getpass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy.orm import Session

from packages.db.admin_schema import ensure_magic_tokens_table
from packages.db.database import SessionLocal, engine
from packages.db.orm_schema_repair import ensure_orm_schema
from packages.db.models import (
    Agency,
    AgencyMembership,
    AgencyRole,
    Client,
    PlanTier,
    User,
)
from services.auth_service import auth as auth_lib

# ---------------------------------------------------------------------------
# Interactive helpers
# ---------------------------------------------------------------------------

def _prompt(label: str, default: str | None = None, required: bool = True) -> str:
    hint = f" [{default}]" if default else ""
    while True:
        raw = input(f"{label}{hint}: ").strip()
        if raw:
            return raw
        if default is not None:
            return default
        if not required:
            return ""
        print("  (required)")


def _prompt_password() -> str:
    while True:
        a = getpass("Password (hidden): ")
        if len(a) < 8:
            print("  Password must be at least 8 characters.")
            continue
        b = getpass("Confirm password: ")
        if a != b:
            print("  Passwords do not match.")
            continue
        return a


def _valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


# ---------------------------------------------------------------------------
# Agency / Client bootstrapping
# ---------------------------------------------------------------------------

def ensure_agency_stack(db: Session, user: User, agency_name: str) -> None:
    existing = (
        db.query(AgencyMembership).filter(AgencyMembership.user_id == user.id).first()
    )
    if existing:
        agency = db.query(Agency).filter(Agency.id == existing.agency_id).first()
        print(f"  Agency already exists: {agency.name if agency else existing.agency_id}")
        return

    name = agency_name.strip() or f"{user.email.split('@')[0]}'s Agency"
    agency = Agency(
        name=name,
        current_plan=PlanTier.FREE,
        credits=0.00,
        billing_status="active",
    )
    db.add(agency)
    db.flush()

    db.add(
        AgencyMembership(
            user_id=user.id,
            agency_id=agency.id,
            role=AgencyRole.ADMIN,
        )
    )
    db.add(
        Client(
            agency_id=agency.id,
            name="Default Brand",
            is_active=True,
        )
    )
    print(f"  Created agency '{name}' (id={agency.id}) with Default Brand client.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create a Kaivo superuser (interactive or CLI).")
    p.add_argument("--email", help="User email")
    p.add_argument("--password", help="User password (min 8 chars)")
    p.add_argument("--name", help="Full name")
    p.add_argument("--company", help="Company / agency name")
    return p.parse_args()


def run() -> int:
    args = _parse_args()

    print("=" * 52)
    print("  Kaivo — Create Superuser")
    print("=" * 52)
    print("Reads DATABASE_URL from .env at the project root.\n")

    # 1. Auto-repair schema before any ORM operations
    try:
        ensure_orm_schema(engine)
        ensure_magic_tokens_table(engine)
        print("[OK] Database schema verified.\n")
    except Exception as e:
        print(f"[FAIL] Schema check failed: {e}", file=sys.stderr)
        print("Make sure DATABASE_URL in .env is correct and PostgreSQL is running.")
        return 1

    # 2. Collect email (CLI arg or interactive)
    email = args.email or _prompt("Email", required=True)
    if not _valid_email(email):
        print("Invalid email format.")
        return 1
    email = email.lower()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()

        # ---- Existing user path ----
        if user:
            print(f"\nUser already exists: {email} (id={user.id}, superuser={user.is_superuser})")
            if user.is_superuser:
                print("Already a superuser — verifying agency stack.")
                ensure_agency_stack(db, user, user.company_name or "")
                db.commit()
                print("[DONE] No changes needed.")
                return 0

            if not args.email:
                promote = input("Promote to superuser? [Y/n]: ").strip().lower()
                if promote in ("n", "no"):
                    print("Aborted.")
                    return 0

            pw = args.password
            if not pw and not args.email:
                ch_pw = input("Set a new password? [y/N]: ").strip().lower()
                if ch_pw in ("y", "yes"):
                    pw = _prompt_password()
            if pw:
                user.hashed_password = auth_lib.get_password_hash(pw)

            user.is_superuser = True
            user.is_active = True
            agency_name = args.company or (
                user.company_name
                or _prompt("Agency name (for new stack if missing)",
                           default=f"{email.split('@')[0]}'s Agency")
            )
            ensure_agency_stack(db, user, agency_name)
            db.commit()
            print(f"\n[DONE] Superuser updated: {email}")
            return 0

        # ---- New user path ----
        password = args.password or _prompt_password()
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            return 1
        full_name = args.name or _prompt("Full name", default=email.split("@")[0])
        company = args.company or _prompt("Company / agency name", default=f"{full_name}'s Agency")

        user = User(
            email=email,
            hashed_password=auth_lib.get_password_hash(password),
            full_name=full_name or None,
            company_name=company or None,
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        db.flush()

        ensure_agency_stack(db, user, company)

        db.commit()
        db.refresh(user)

        print(f"\n[DONE] Superuser created: {user.email} (id={user.id})")
        print("Sign in at the agency portal /login with this email and password.")
        return 0

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(run())
