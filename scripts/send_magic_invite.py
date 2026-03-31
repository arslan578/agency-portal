#!/usr/bin/env python3
"""
Send a magic-link invite into the Kaivo Agency Portal and print the invite URL.

This is a developer/QA helper so you can simulate the
`getkaivo.com → Stripe → magic link → agency.getkaivo.com/verify` flow
without touching the getkaivo.com codebase or using any superadmin UI.

Usage (from repo root, with DATABASE_URL configured in .env):

    # FRONTEND_URL and MAGIC_LINK_PATH are optional; defaults match local dev
    export FRONTEND_URL="http://localhost:3000"
    # export MAGIC_LINK_PATH="/verify"

    python scripts/send_magic_invite.py --email agency-owner@example.com --role agency_admin

This will:
  1. Insert a MagicToken row directly into the database for the given email.
  2. Print the `invite_link` you can paste into a browser to walk through:
       /verify → (optional) /signup → /onboarding → /
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import text

# Ensure project root is on sys.path so `packages.*` imports work when the script
# is executed directly from the repo root.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packages.db.database import SessionLocal, engine
from packages.db.admin_schema import ensure_magic_tokens_table
from packages.db.models import AgencyRole


def create_magic_token(
    email: str,
    role: str,
    agency_id: Optional[int],
) -> str:
    """
    Insert a MagicToken row directly and return the raw token string.

    This mirrors the behavior in services/admin_service/main.py but avoids
    any dependency on superuser login or the admin HTTP API.
    """
    ensure_magic_tokens_table(engine)

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Invalidate any existing unused, unexpired tokens for this email
        db.execute(
            text(
                """
                UPDATE magic_tokens
                SET used_at = :now
                WHERE email = :email
                  AND used_at IS NULL
                  AND expires_at > :now
                """
            ),
            {"email": email, "now": now},
        )

        # Map string role to DB enum; default to agency_viewer if unknown
        try:
            role_enum = AgencyRole(role)
        except Exception:
            role_enum = AgencyRole.VIEWER

        # Generate a URL-safe token similar to admin_service (32 bytes)
        import secrets

        token = secrets.token_urlsafe(32)
        expires_at = now + timedelta(hours=48)

        db.execute(
            text(
                """
                INSERT INTO magic_tokens (token, email, role, agency_id, expires_at)
                VALUES (:token, :email, :role, :agency_id, :expires_at)
                """
            ),
            {
                "token": token,
                "email": email,
                "role": role_enum.value,
                "agency_id": agency_id,
                "expires_at": expires_at,
            },
        )

        db.commit()
        return token
    except Exception as exc:
        db.rollback()
        print(f"ERROR: Failed to create magic token: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a magic-link invite into the Kaivo Agency Portal.",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Email address to invite (agency owner or team member).",
    )
    parser.add_argument(
        "--role",
        default="agency_admin",
        choices=["agency_admin", "agency_member", "agency_viewer"],
        help="Role for the invited user (default: agency_admin).",
    )
    parser.add_argument(
        "--agency-id",
        type=int,
        default=None,
        help="Optional numeric agency ID to attach this user to. "
        "If omitted, the backend may attach or create an agency depending on configuration.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    invitee = args.email.strip().lower()
    if not invitee:
        print("ERROR: --email is required.", file=sys.stderr)
        return 1

    print(f"Creating magic-link invite for {invitee} (role={args.role})...")
    if args.agency_id is not None:
        print(f"  Attaching to agency_id={args.agency_id}")

    token = create_magic_token(
        email=invitee,
        role=args.role,
        agency_id=args.agency_id,
    )

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    magic_path = os.getenv("MAGIC_LINK_PATH", "/verify")
    invite_link = f"{frontend_url}{magic_path}?token={token}"

    print("\n=== Invite Created ===")
    print(f"Email: {invitee}")
    print(f"Role: {args.role}")
    if args.agency_id is not None:
        print(f"Agency ID: {args.agency_id}")
    print(f"Token: {token}")
    print(f"\nMagic link URL:\n  {invite_link}")
    print(
        "\nOpen this link in a browser to test the full flow:\n"
        "  1) /verify (magic link verification)\n"
        "  2) /signup (if user has no password yet)\n"
        "  3) /onboarding (for agency_admin in an empty workspace)\n"
        "  4) / (main dashboard)"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

