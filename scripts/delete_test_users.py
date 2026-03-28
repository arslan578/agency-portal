"""
Delete all non-superuser users and their related data.
Preserves superuser accounts completely.

Usage:
    python scripts/delete_test_users.py              # interactive confirmation
    python scripts/delete_test_users.py --dry-run    # preview only, no changes
    python scripts/delete_test_users.py --force       # skip confirmation prompt

Run from the project root:
    python scripts/delete_test_users.py --dry-run
"""

import sys
import os
import argparse
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(dotenv_path=project_root / ".env")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


def get_engine():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)
    return create_engine(url)


def main():
    parser = argparse.ArgumentParser(description="Delete all non-superuser users and related data")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be deleted without making changes")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    engine = get_engine()
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # Find non-superuser users
        users = db.execute(
            text("SELECT id, email, is_superuser, created_at FROM users WHERE is_superuser = false ORDER BY id")
        ).fetchall()

        superusers = db.execute(
            text("SELECT id, email FROM users WHERE is_superuser = true ORDER BY id")
        ).fetchall()

        print(f"\n{'='*60}")
        print("  Kaivo — Delete Test Users")
        print(f"{'='*60}")
        print(f"\n  Superuser accounts (PRESERVED):")
        for su in superusers:
            print(f"    [KEEP] id={su[0]}  {su[1]}")

        print(f"\n  Non-superuser accounts to delete: {len(users)}")
        for u in users:
            print(f"    [DELETE] id={u[0]}  {u[1]}  (created: {u[3]})")

        if not users:
            print("\n  Nothing to delete. All users are superusers.")
            return

        user_ids = [u[0] for u in users]
        user_ids_tuple = tuple(user_ids) if len(user_ids) > 1 else f"({user_ids[0]})"

        user_emails = [u[1] for u in users]

        def safe_count(sql):
            try:
                return db.execute(text(sql)).scalar() or 0
            except Exception:
                db.rollback()
                return 0

        if len(user_ids) == 1:
            uid_where = f"user_id = {user_ids[0]}"
            invited_where = f"invited_by_user_id = {user_ids[0]}"
        else:
            uid_where = f"user_id IN {tuple(user_ids)}"
            invited_where = f"invited_by_user_id IN {tuple(user_ids)}"

        email_placeholders = ", ".join(f"'{e}'" for e in user_emails)

        memberships_count = safe_count(f"SELECT COUNT(*) FROM agency_memberships WHERE {uid_where}")
        magic_tokens_count = safe_count(f"SELECT COUNT(*) FROM magic_tokens WHERE email IN ({email_placeholders})")
        invites_count = safe_count(f"SELECT COUNT(*) FROM agency_invites WHERE {invited_where}")

        print(f"\n  Related records that will be deleted:")
        print(f"    agency_memberships:  {memberships_count}")
        print(f"    magic_tokens:        {magic_tokens_count}")
        print(f"    agency_invites:      {invites_count}")

        if args.dry_run:
            print(f"\n  [DRY RUN] No changes made.\n")
            return

        if not args.force:
            confirm = input(f"\n  Type 'DELETE' to confirm deletion of {len(users)} users: ")
            if confirm.strip() != "DELETE":
                print("  Aborted.\n")
                return

        # Delete in correct order (foreign key constraints)
        deleted = {}

        def safe_delete(label, sql):
            try:
                r = db.execute(text(sql))
                deleted[label] = r.rowcount
            except Exception as e:
                db.rollback()
                print(f"  WARN: {label}: {e}")
                deleted[label] = 0

        safe_delete("agency_memberships", f"DELETE FROM agency_memberships WHERE {uid_where}")
        safe_delete("magic_tokens", f"DELETE FROM magic_tokens WHERE email IN ({email_placeholders})")
        safe_delete("agency_invites", f"DELETE FROM agency_invites WHERE {invited_where}")
        safe_delete("client_memberships", f"DELETE FROM client_memberships WHERE {uid_where}")

        try:
            r = db.execute(text("DELETE FROM users WHERE is_superuser = false"))
            deleted["users"] = r.rowcount
        except Exception as e:
            print(f"  ERROR deleting users: {e}")
            db.rollback()
            return

        db.commit()

        print(f"\n  Deleted successfully:")
        for table, count in deleted.items():
            print(f"    {table}: {count}")
        print(f"\n  Done.\n")

    except Exception as e:
        db.rollback()
        print(f"\n  ERROR: {e}\n")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
