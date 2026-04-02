import logging
import os
import sys
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
import json

# Setup logging
logging.basicConfig(level=logging.INFO)

# Add services to path
sys.path.append(os.path.abspath('.'))

load_dotenv('.env')
db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)

from services.account_service.meta_bm_service import fetch_client_meta_insights

with Session(engine) as db:
    result = fetch_client_meta_insights(db, client_id=7, agency_id=3, refresh=True)
    print(json.dumps(result, indent=2, default=str))
