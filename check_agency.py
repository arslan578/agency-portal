from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

load_dotenv('.env')
db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)
with engine.connect() as conn:
    query = text("SELECT agency_id FROM clients WHERE id = 7")
    result = conn.execute(query).fetchone()
    print(result)
