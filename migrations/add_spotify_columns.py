"""Add missing Spotify columns to clients table."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

statements = [
    # --- Clients Table ---
    "ALTER TABLE clients ADD COLUMN IF NOT EXISTS agency_spotify_account_id VARCHAR(100)",
    "ALTER TABLE clients ADD COLUMN IF NOT EXISTS spotify_account_status VARCHAR(30) DEFAULT 'agency_not_connected'",
    "ALTER TABLE clients ADD COLUMN IF NOT EXISTS spotify_account_name VARCHAR(255)",
    "ALTER TABLE clients ADD COLUMN IF NOT EXISTS spotify_linked_at TIMESTAMPTZ",
    
    # --- Agencies Table (Spotify) ---
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS spotify_agency_access_token TEXT",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS spotify_token_expires_at TIMESTAMPTZ",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS spotify_connected_at TIMESTAMPTZ",

    # --- Agencies Table (Reddit) ---
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reddit_agency_access_token TEXT",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reddit_refresh_token TEXT",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reddit_token_expires_at TIMESTAMPTZ",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reddit_connected_at TIMESTAMPTZ",
]

for sql in statements:
    print(f"  Running: {sql[:60]}...")
    cur.execute(sql)

conn.commit()
print("Done — Spotify columns added to clients table.")
cur.close()
conn.close()
