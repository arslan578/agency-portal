-- Convert tier column from INTEGER to proper ENUM type

-- Step 1: Create the enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE tierenum AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Drop the default first
ALTER TABLE accounts ALTER COLUMN tier DROP DEFAULT;

-- Step 3: Convert the column type with proper mapping
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

-- Step 4: Set the new default
ALTER TABLE accounts 
    ALTER COLUMN tier SET DEFAULT 'FREE'::tierenum;

-- Verify
SELECT id, name, tier FROM accounts;
