-- =============================================================================
-- Meta Business Manager Integration — Database Migration
-- Target Database: Agency Portal (kaivo)
-- =============================================================================

-- 1. Add Meta BM columns to agencies table
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS meta_business_manager_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_business_manager_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_agency_access_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_token_expires_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_connected_at TIMESTAMP DEFAULT NULL;

-- 2. Add Meta linking columns to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS agency_meta_account_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_account_status VARCHAR(30) DEFAULT 'agency_not_connected',
  ADD COLUMN IF NOT EXISTS meta_account_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_linked_at TIMESTAMP DEFAULT NULL;

-- meta_account_status values:
-- 'agency_not_connected' → agency has not connected BM yet
-- 'not_linked'           → BM connected but this client's account not found under it
-- 'linked_kaivo_matched' → client's Kaivo account found and auto-matched under BM
-- 'linked_manual'        → agency manually assigned an account to this client

-- 3. Create audit_logs table for Meta operations
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER REFERENCES agencies(id),
  client_id INTEGER REFERENCES clients(id) NULL,
  user_id INTEGER REFERENCES users(id) NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
