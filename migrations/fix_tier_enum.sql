-- Convert tier column from INTEGER to proper ENUM type

-- First, create the enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE tierenum AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Convert the tier column to use the enum, mapping integers to enum values
ALTER TABLE accounts 
    ALTER COLUMN tier TYPE tierenum 
    USING (
        CASE tier
            WHEN 0 THEN 'FREE'::tierenum
            WHEN 1 THEN 'STARTER'::tierenum
            WHEN 2 THEN 'GROWTH'::tierenum
            WHEN 3 THEN 'SCALE'::tierenum
            WHEN 4 THEN 'ENTERPRISE'::tierenum
            ELSE 'FREE'::tierenum
        END
    );

-- Update the default value to use the enum
ALTER TABLE accounts 
    ALTER COLUMN tier SET DEFAULT 'FREE'::tierenum;

-- Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'accounts' AND column_name = 'tier';
