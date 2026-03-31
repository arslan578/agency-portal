import os
from datetime import datetime, timedelta
from packages.db.database import SessionLocal
from packages.db.models import MagicToken, Agency, AgencyRole, User

def seed_test_token():
    db = SessionLocal()
    try:
        # 1. Ensure we have an agency
        agency = db.query(Agency).first()
        if not agency:
            agency = Agency(name="Test Agency")
            db.add(agency)
            db.commit()
            db.refresh(agency)
            print(f"Created Test Agency with ID: {agency.id}")
        else:
            print(f"Using Existing Agency ID: {agency.id}")

        # 2. Cleanup old test tokens if any
        token_str = "member-test-token-001"
        db.query(MagicToken).filter(MagicToken.token == token_str).delete()

        # 3. Create a fresh token
        token = MagicToken(
            token=token_str,
            email="member-test@agency.com",
            role=AgencyRole.MEMBER,
            agency_id=agency.id,
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        db.add(token)
        db.commit()
        print(f"Inserted test token: {token_str} for {token.email}")

    finally:
        db.close()

if __name__ == "__main__":
    seed_test_token()
