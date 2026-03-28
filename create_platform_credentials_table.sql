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
