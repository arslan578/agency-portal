-- Agency Multi-Tenancy Migration
-- Date: 2026-02-01
-- Purpose: Unify Agency as the primary workspace entity with billing

-- ============================================
-- SECTION 1: Add billing columns to agencies
-- ============================================

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS credits DECIMAL(10,2) DEFAULT 0.00 NOT NULL;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS billing_status VARCHAR DEFAULT 'active';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- SECTION 2: Add agency_id to subscriptions
-- ============================================

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES agencies(id);

-- Migrate existing subscriptions: link to agency via account
-- This assumes accounts were created alongside agencies
UPDATE subscriptions s
SET agency_id = (
    SELECT a.id FROM agencies a 
    LIMIT 1
)
WHERE s.agency_id IS NULL;

-- ============================================
-- SECTION 3: Ensure default agency exists
-- ============================================

INSERT INTO agencies (id, name, current_plan, credits, billing_status)
SELECT 1, 'Default Agency', 'free', 0.00, 'active'
WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE id = 1);

-- ============================================
-- SECTION 4: Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_agency_id ON subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_agencies_billing_status ON agencies(billing_status);

-- ============================================
-- Verification
-- ============================================

SELECT 'Agency multi-tenancy migration complete' as status;
SELECT id, name, current_plan, credits, billing_status FROM agencies LIMIT 5;
