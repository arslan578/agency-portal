import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    res = conn.execute(text("""
        SELECT u.id, u.email, m.agency_id, a.name 
        FROM users u 
        LEFT JOIN agency_memberships m ON u.id = m.user_id 
        LEFT JOIN agencies a ON m.agency_id = a.id
        LIMIT 10
    """))
    print("User -> Agency Memberships:")
    for row in res:
        print(f"User ID={row[0]}, Email={row[1]}, Agency ID={row[2]}, Agency Name={row[3]}")
