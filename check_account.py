from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

load_dotenv('.env')
db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)
with engine.connect() as conn:
    query = text("SELECT id, client_id, platform, account_id FROM platform_accounts WHERE account_id IN ('act_962660682967498', '962660682967498')")
    result = conn.execute(query).fetchall()
    print(result)
