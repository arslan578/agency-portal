-- Ensure accounts table exists (create if missing, based on Account model in services/account_service/models.py)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR,
    tier INTEGER DEFAULT 0, -- Maps to TierEnum: 0=FREE, 1=STARTER, 2=GROWTH, 3=SCALE, 4=ENTERPRISE
    monthly_spend DECIMAL(10, 2) DEFAULT 0.00,
    billing_status VARCHAR DEFAULT 'active',
    parent_account_id INTEGER REFERENCES accounts(id),
    address VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_accounts_id ON accounts(id);
CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier);

-- Ensure brands table exists (create if missing, based on Brand model)
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    name VARCHAR,
    sector VARCHAR,
    logo_url VARCHAR,
    credits DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_brands_id ON brands(id);
CREATE INDEX IF NOT EXISTS idx_brands_account_id ON brands(account_id);

-- Ensure credit_transactions table exists (create if missing, based on CreditTransaction model in services/billing_service/models.py)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    brand_id INTEGER REFERENCES brands(id),
    amount DECIMAL(10, 2),
    transaction_type VARCHAR(50),
    description VARCHAR(255),
    stripe_payment_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_brand_id ON credit_transactions(brand_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_id ON credit_transactions(stripe_payment_id);

-- Create subscriptions table (new)
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    brand_id INTEGER REFERENCES brands(id), -- For credit deduction
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255),
    plan_id VARCHAR(50) NOT NULL, -- 'starter', 'growth', 'scale', 'enterprise'
    status VARCHAR(50) NOT NULL, -- 'active', 'canceled', 'past_due', 'unpaid', 'trialing'
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account_id ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_brand_id ON subscriptions(brand_id);
