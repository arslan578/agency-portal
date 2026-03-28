"""
Apply platform_credentials table migration
Run this script to create the missing platform_credentials table.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database connection string
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env file")
    exit(1)

print(f"Connecting to database...")

# Parse PostgreSQL connection string
try:
    from sqlalchemy import create_engine, text
except ImportError:
    print("ERROR: sqlalchemy is required. Install with: pip install sqlalchemy")
    exit(1)

engine = create_engine(DATABASE_URL)

# SQL to create the table
sql_script = """
-- Create platform_credentials table if it doesn't exist
CREATE TABLE IF NOT EXISTS platform_credentials (
    id                      SERIAL PRIMARY KEY,
    account_id              INTEGER NOT NULL,
    platform                VARCHAR(50) NOT NULL,
    access_token_encrypted  TEXT,
    refresh_token_encrypted TEXT,
    app_id                  VARCHAR(255),
    app_secret_encrypted    TEXT,
    token_expires_at        TIMESTAMP WITH TIME ZONE,
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS ix_platform_credentials_id         ON platform_credentials(id);
CREATE INDEX IF NOT EXISTS ix_platform_credentials_account_id ON platform_credentials(account_id);

-- Add unique constraint to prevent duplicate credentials for same account+platform
ALTER TABLE platform_credentials 
ADD CONSTRAINT uq_platform_credentials_account_platform 
UNIQUE (account_id, platform);
"""

try:
    with engine.connect() as conn:
        # Execute the SQL script
        conn.execute(text(sql_script))
        conn.commit()
        
    print("✓ Successfully created platform_credentials table")
    print("✓ Created indexes for better performance")
    print("✓ Added unique constraint on (account_id, platform)")
    
except Exception as e:
    print(f"ERROR: Failed to create table: {e}")
    exit(1)
