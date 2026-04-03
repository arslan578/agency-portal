from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

load_dotenv('.env')
db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)
with engine.connect() as conn:
    query = text("SELECT id, name, status, platform_campaign_ids FROM campaigns WHERE client_id = 7")
    result = conn.execute(query).fetchall()
    for row in result:
        print(row)
