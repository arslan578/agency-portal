import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("DATABASE_URL not set")
    exit(1)

engine = create_engine(db_url)
with engine.connect() as conn:
    res = conn.execute(text("SELECT id, name FROM agencies LIMIT 5"))
    print("Agencies in DB:")
    for row in res:
        print(f"ID={row[0]}, Name={row[1]}")
