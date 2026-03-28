-- Migration: Add agency_invites table for pending invitations
-- Run this on your database to enable the invite system

-- Create invite status enum if it doesn't exist (uppercase to match SQLAlchemy enum names)
DO $$ BEGIN
    CREATE TYPE invitestatus AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create agency_invites table
CREATE TABLE IF NOT EXISTS agency_invites (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role agencyrole DEFAULT 'VIEWER',
    token VARCHAR(255) UNIQUE NOT NULL,
    status invitestatus DEFAULT 'PENDING',
    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agency_invites_email ON agency_invites(email);
CREATE INDEX IF NOT EXISTS idx_agency_invites_token ON agency_invites(token);
CREATE INDEX IF NOT EXISTS idx_agency_invites_agency_id ON agency_invites(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_invites_status ON agency_invites(status);
