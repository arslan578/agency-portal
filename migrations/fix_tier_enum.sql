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
        CASE
            -- If `tier` is still INTEGER (0..4), map it into the ENUM values.
            WHEN tier::text = '0' THEN 'FREE'::tierenum
            WHEN tier::text = '1' THEN 'STARTER'::tierenum
            WHEN tier::text = '2' THEN 'GROWTH'::tierenum
            WHEN tier::text = '3' THEN 'SCALE'::tierenum
            WHEN tier::text = '4' THEN 'ENTERPRISE'::tierenum

            -- If `tier` is already an ENUM, preserve the existing value.
            WHEN tier::text = 'FREE' THEN 'FREE'::tierenum
            WHEN tier::text = 'STARTER' THEN 'STARTER'::tierenum
            WHEN tier::text = 'GROWTH' THEN 'GROWTH'::tierenum
            WHEN tier::text = 'SCALE' THEN 'SCALE'::tierenum
            WHEN tier::text = 'ENTERPRISE' THEN 'ENTERPRISE'::tierenum

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
