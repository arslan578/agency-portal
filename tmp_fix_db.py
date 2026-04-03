from dotenv import load_dotenv
import os
from sqlalchemy import create_engine
from sqlalchemy import text

load_dotenv(".env")
db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("No DATABASE_URL found")
    exit(1)

engine = create_engine(db_url)
with engine.begin() as conn:
    print("Updating version from d36 to 015 or something...")
    # Just to be safe, update any version to 056tiktokagencyfields
    conn.execute(text("UPDATE alembic_version SET version_num = '056tiktokagencyfields'"))
print("Updated alembic_version successfully")
