-- Migration: Unify Agency Multi-Tenancy Model
-- This migration consolidates the legacy Account/Brand model into the Agency/Client model

-- ============================================
-- PHASE 1: Add new columns
-- ============================================

-- Add client_id to plans table (currently only has account_id)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS idx_plans_client_id ON plans(client_id);

-- Add agency_id to credit_transactions (currently only has brand_id)
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES agencies(id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_agency_id ON credit_transactions(agency_id);

-- ============================================
-- PHASE 2: Migrate existing data
-- ============================================

-- Migrate campaigns: ensure client_id is set
-- (campaigns have both account_id and client_id, set client_id if null)
UPDATE campaigns SET client_id = 1 WHERE client_id IS NULL AND account_id IS NOT NULL;

-- Migrate plans: set client_id from account_id
UPDATE plans SET client_id = 1 WHERE client_id IS NULL AND account_id IS NOT NULL;

-- Migrate subscriptions: ensure agency_id is set
UPDATE subscriptions SET agency_id = 1 WHERE agency_id IS NULL AND account_id IS NOT NULL;

-- Migrate credit_transactions: set agency_id from brand relationship
-- First, get the agency_id from the first agency (for existing transactions)
UPDATE credit_transactions SET agency_id = 1 WHERE agency_id IS NULL AND brand_id IS NOT NULL;

-- ============================================
-- PHASE 3: Cleanup (run AFTER code deployment)
-- Uncomment these after verifying the application works
-- ============================================

-- ALTER TABLE campaigns DROP COLUMN IF EXISTS account_id;
-- ALTER TABLE audiences DROP COLUMN IF EXISTS account_id;
-- ALTER TABLE plans DROP COLUMN IF EXISTS account_id;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS account_id;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS brand_id;
-- ALTER TABLE credit_transactions DROP COLUMN IF EXISTS brand_id;

-- Drop legacy indexes
-- DROP INDEX IF EXISTS ix_campaigns_account_id;
-- DROP INDEX IF EXISTS ix_audiences_account_id;
-- DROP INDEX IF EXISTS ix_plans_account_id;
-- DROP INDEX IF EXISTS idx_subscriptions_account_id;
-- DROP INDEX IF EXISTS idx_subscriptions_brand_id;

-- Drop legacy tables (only after confirming no dependencies)
-- DROP TABLE IF EXISTS licenses;
-- DROP TABLE IF EXISTS brands;
-- DROP TABLE IF EXISTS accounts;
