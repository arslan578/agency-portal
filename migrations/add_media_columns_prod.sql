-- Migration: Add media_url and media_type columns to campaigns and plans tables
-- Date: 2025-01-25
-- Purpose: Support Cloudinary media storage for campaigns and plans

-- Add columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type VARCHAR;

-- Add columns to plans table (if not already present)
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type VARCHAR;

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
AND column_name IN ('media_url', 'media_type');

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'plans' 
AND column_name IN ('media_url', 'media_type');
