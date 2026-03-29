#!/usr/bin/env python3
"""
Quick script to create/update demo user directly in database.
Uses raw SQL to avoid ORM enum issues.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from packages.db.database import SessionLocal, engine
from services.auth_service import auth as auth_lib

def create_demo_user():
    email = "aliahmad678923@gmail.com"
    password = "Hello123@"
    name = "Ali"
    company = "Lahories"
    
    db = SessionLocal()
    try:
        # Check if user exists
        user = db.execute(
            text("SELECT id, email, is_superuser FROM users WHERE email = :email"),
            {"email": email}
        ).first()
        
        if user:
            print(f"User already exists: {email} (id={user.id})")
            # Update password and make superuser
            hashed = auth_lib.get_password_hash(password)
            db.execute(
                text("""
                    UPDATE users 
                    SET hashed_password = :password, 
                        is_superuser = true, 
                        is_active = true,
                        full_name = :name
                    WHERE email = :email
                """),
                {"password": hashed, "email": email, "name": name}
            )
            print("Updated user credentials and promoted to superuser.")
        else:
            # Create new user
            hashed = auth_lib.get_password_hash(password)
            result = db.execute(
                text("""
                    INSERT INTO users (email, hashed_password, full_name, is_active, is_superuser)
                    VALUES (:email, :password, :name, true, true)
                    RETURNING id
                """),
                {"email": email, "password": hashed, "name": name}
            )
            user_id = result.scalar()
            print(f"Created new user: {email} (id={user_id})")
        
        # Find or create agency
        agency_result = db.execute(
            text("""
                SELECT a.id FROM agencies a
                JOIN agency_memberships am ON a.id = am.agency_id
                JOIN users u ON u.id = am.user_id
                WHERE u.email = :email
            """),
            {"email": email}
        ).first()
        
        if agency_result:
            print(f"Agency already exists (id={agency_result[0]})")
        else:
            # Get user_id again if we just created
            if not user:
                user_result = db.execute(
                    text("SELECT id FROM users WHERE email = :email"),
                    {"email": email}
                ).first()
                user_id = user_result[0]
            else:
                user_id = user[0]
            
            # Create agency with correct enum value
            db.execute(
                text("""
                    INSERT INTO agencies (name, current_plan, credits, billing_status)
                    VALUES (:name, 'free', 0.00, 'active')
                    RETURNING id
                """),
                {"name": company}
            )
            agency_id = db.execute(text("SELECT LASTVAL()")).scalar()
            
            # Add membership - use lowercase as database expects
            db.execute(
                text("""
                    INSERT INTO agency_memberships (user_id, agency_id, role)
                    VALUES (:user_id, :agency_id, 'agency_admin')
                """),
                {"user_id": user_id, "agency_id": agency_id}
            )
            
            # Create default client
            db.execute(
                text("""
                    INSERT INTO clients (agency_id, name, is_active)
                    VALUES (:agency_id, 'Default Brand', true)
                """),
                {"agency_id": agency_id}
            )
            
            print(f"Created agency '{company}' (id={agency_id}) with Default Brand client.")
        
        db.commit()
        print("\n[DONE] Demo user ready!")
        print(f"\nLogin Credentials:")
        print(f"  Email: {email}")
        print(f"  Password: {password}")
        
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] {e}", file=sys.stderr)
        return False
    finally:
        db.close()
    
    return True

if __name__ == "__main__":
    success = create_demo_user()
    sys.exit(0 if success else 1)
