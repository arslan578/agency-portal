-- Create licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    user_id INTEGER,
    role VARCHAR(50) DEFAULT 'owner',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_licenses_account_id ON licenses(account_id);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);

-- Verify
SELECT 'licenses table created' as status;
