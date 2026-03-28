-- =============================================================================
-- Kaivo Demo Account Seed Script
-- Creates a fully mocked-up account with realistic data
-- Login: demo@kaivo.com / demo1234
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEMO USER
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO users (email, hashed_password, full_name, is_active, is_superuser, company_name, created_at)
VALUES (
    'demo@kaivo.com',
    '$2b$12$yP.PO/OVz5bN/G.UxrnfkeFZnTEYOiIlKb.s198CVFRY0FGqXL/E2',
    'Demo User',
    true,
    false,
    'Acme Digital Co.',
    NOW() - INTERVAL '90 days'
)
ON CONFLICT (email) DO NOTHING;

-- Grab the user id
DO $$
DECLARE
    v_user_id INT;
    v_agency_id INT;
    v_client_id INT;
    v_aud_broad INT;
    v_aud_retarget INT;
    v_aud_lookalike INT;
    v_plan1 INT;
    v_plan2 INT;
    v_plan3 INT;
    v_plan4 INT;
    v_plan5 INT;
    v_camp1 INT;
    v_camp2 INT;
    v_camp3 INT;
    v_camp4 INT;
    v_camp5 INT;
    v_camp6 INT;
    v_camp7 INT;
    v_camp8 INT;
    v_camp9 INT;
    v_camp10 INT;
    d DATE;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE email = 'demo@kaivo.com';
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Demo user not created';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. AGENCY
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO agencies (name, current_plan, credits, billing_status, created_at)
    VALUES ('Acme Digital Co.', 'GROWTH', 5000.00, 'active', NOW() - INTERVAL '90 days')
    RETURNING id INTO v_agency_id;

    INSERT INTO agency_memberships (user_id, agency_id, role)
    VALUES (v_user_id, v_agency_id, 'ADMIN');

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. CLIENT (BRAND)
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO clients (agency_id, name, industry, website, markup_percent, is_active, created_at)
    VALUES (v_agency_id, 'Acme Digital Co.', 'E-Commerce', 'https://acmedigital.com', 15.0000, true, NOW() - INTERVAL '90 days')
    RETURNING id INTO v_client_id;

    INSERT INTO client_memberships (user_id, client_id, role)
    VALUES (v_user_id, v_client_id, 'OPERATOR');

    INSERT INTO client_user_permissions (client_id, user_id, role)
    VALUES (v_client_id, v_user_id, 'admin');

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. AUDIENCES
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO audiences (client_id, name, description, is_uploaded, definition_json, created_at)
    VALUES (v_client_id, 'Broad Interest - Online Shoppers', 'Adults 25-54 interested in online shopping, fashion, and lifestyle', false,
        '{"age_min": 25, "age_max": 54, "genders": ["all"], "interests": ["online shopping", "fashion", "lifestyle"], "locations": ["US", "CA"]}',
        NOW() - INTERVAL '80 days')
    RETURNING id INTO v_aud_broad;

    INSERT INTO audiences (client_id, name, description, is_uploaded, definition_json, created_at)
    VALUES (v_client_id, 'Website Retargeting - 30 Days', 'Users who visited acmedigital.com in the last 30 days', false,
        '{"source": "website_pixel", "lookback_days": 30, "events": ["page_view", "add_to_cart"]}',
        NOW() - INTERVAL '60 days')
    RETURNING id INTO v_aud_retarget;

    INSERT INTO audiences (client_id, name, description, is_uploaded, definition_json, created_at)
    VALUES (v_client_id, 'Lookalike - Top Purchasers', 'Lookalike audience based on top 5% purchasers', false,
        '{"source": "lookalike", "seed": "top_purchasers", "expansion": 3, "country": "US"}',
        NOW() - INTERVAL '45 days')
    RETURNING id INTO v_aud_lookalike;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. PLANS
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO plans (name, goal, total_budget_cents, audience_id, platform_allocations_json, status)
    VALUES ('Spring Sale Awareness', 'awareness', 500000, v_aud_broad, '{"meta": 300000, "google": 200000}', 'CONVERTED')
    RETURNING id INTO v_plan1;

    INSERT INTO plans (name, goal, total_budget_cents, audience_id, platform_allocations_json, status)
    VALUES ('Retargeting Conversions', 'conversion', 350000, v_aud_retarget, '{"meta": 200000, "google": 150000}', 'CONVERTED')
    RETURNING id INTO v_plan2;

    INSERT INTO plans (name, goal, total_budget_cents, audience_id, platform_allocations_json, status)
    VALUES ('Summer Brand Push', 'awareness', 800000, v_aud_broad, '{"meta": 450000, "google": 350000}', 'CONVERTED')
    RETURNING id INTO v_plan3;

    INSERT INTO plans (name, goal, total_budget_cents, audience_id, platform_allocations_json, status)
    VALUES ('Lookalike Scale Test', 'conversion', 250000, v_aud_lookalike, '{"meta": 150000, "google": 100000}', 'CONVERTED')
    RETURNING id INTO v_plan4;

    INSERT INTO plans (name, goal, total_budget_cents, audience_id, platform_allocations_json, status)
    VALUES ('Holiday Season 2026', 'conversion', 1200000, v_aud_retarget, '{"meta": 600000, "google": 600000}', 'DRAFT')
    RETURNING id INTO v_plan5;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. CAMPAIGNS (mix of statuses)
    -- ─────────────────────────────────────────────────────────────────────────

    -- ACTIVE campaigns with platform allocations
    INSERT INTO campaigns (client_id, audience_id, plan_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_broad, v_plan1, 'Spring Sale Awareness', 'awareness', 500000,
        NOW() - INTERVAL '45 days', NOW() + INTERVAL '15 days', 'ACTIVE',
        '{"meta": 300000, "google": 200000}', NOW() - INTERVAL '45 days', NOW())
    RETURNING id INTO v_camp1;

    INSERT INTO campaigns (client_id, audience_id, plan_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_retarget, v_plan2, 'Retargeting Conversions Q1', 'conversion', 350000,
        NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', 'ACTIVE',
        '{"meta": 200000, "google": 150000}', NOW() - INTERVAL '30 days', NOW())
    RETURNING id INTO v_camp2;

    INSERT INTO campaigns (client_id, audience_id, plan_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_broad, v_plan3, 'Summer Brand Push', 'awareness', 800000,
        NOW() - INTERVAL '21 days', NOW() + INTERVAL '39 days', 'ACTIVE',
        '{"meta": 450000, "google": 350000}', NOW() - INTERVAL '21 days', NOW())
    RETURNING id INTO v_camp3;

    INSERT INTO campaigns (client_id, audience_id, plan_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_lookalike, v_plan4, 'Lookalike Scale Test', 'conversion', 250000,
        NOW() - INTERVAL '14 days', NOW() + INTERVAL '16 days', 'ACTIVE',
        '{"meta": 150000, "google": 100000}', NOW() - INTERVAL '14 days', NOW())
    RETURNING id INTO v_camp4;

    INSERT INTO campaigns (client_id, audience_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_broad, 'Google-Only Search Test', 'conversion', 150000,
        NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', 'ACTIVE',
        '{"google": 150000}', NOW() - INTERVAL '10 days', NOW())
    RETURNING id INTO v_camp5;

    INSERT INTO campaigns (client_id, audience_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_retarget, 'Meta Retargeting Blitz', 'conversion', 200000,
        NOW() - INTERVAL '7 days', NOW() + INTERVAL '23 days', 'ACTIVE',
        '{"meta": 200000}', NOW() - INTERVAL '7 days', NOW())
    RETURNING id INTO v_camp6;

    -- PAUSED campaign
    INSERT INTO campaigns (client_id, audience_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_broad, 'Valentine''s Day Promo', 'awareness', 300000,
        NOW() - INTERVAL '60 days', NOW() - INTERVAL '14 days', 'PAUSED',
        '{"meta": 200000, "google": 100000}', NOW() - INTERVAL '65 days', NOW() - INTERVAL '14 days')
    RETURNING id INTO v_camp7;

    -- COMPLETED campaign
    INSERT INTO campaigns (client_id, audience_id, name, goal, total_budget_cents, start_date, end_date, status, platform_allocations, created_at, updated_at)
    VALUES (v_client_id, v_aud_retarget, 'New Year Flash Sale', 'conversion', 400000,
        NOW() - INTERVAL '85 days', NOW() - INTERVAL '55 days', 'COMPLETED',
        '{"meta": 250000, "google": 150000}', NOW() - INTERVAL '90 days', NOW() - INTERVAL '55 days')
    RETURNING id INTO v_camp8;

    -- DRAFT campaigns
    INSERT INTO campaigns (client_id, audience_id, plan_id, name, goal, total_budget_cents, status, platform_allocations, created_at)
    VALUES (v_client_id, v_aud_retarget, v_plan5, 'Holiday Season 2026', 'conversion', 1200000, 'DRAFT',
        '{"meta": 600000, "google": 600000}', NOW() - INTERVAL '3 days')
    RETURNING id INTO v_camp9;

    INSERT INTO campaigns (client_id, audience_id, name, goal, total_budget_cents, status, platform_allocations, created_at)
    VALUES (v_client_id, v_aud_lookalike, 'Back to School 2026', 'awareness', 450000, 'DRAFT',
        '{"meta": 250000, "google": 200000}', NOW() - INTERVAL '1 day')
    RETURNING id INTO v_camp10;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. USAGE RECORDS (the data that powers the dashboard)
    -- ─────────────────────────────────────────────────────────────────────────

    -- Campaign 1: Spring Sale Awareness (45 days of data, meta + google)
    FOR d IN SELECT generate_series((CURRENT_DATE - 44), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp1, d, 'meta',
            8000 + floor(random() * 4000)::int,
            120 + floor(random() * 80)::int,
            55.00 + round((random() * 25)::numeric, 2),
            63.25 + round((random() * 28)::numeric, 2),
            72.74 + round((random() * 32)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp1, d, 'google',
            6000 + floor(random() * 3000)::int,
            200 + floor(random() * 120)::int,
            35.00 + round((random() * 18)::numeric, 2),
            40.25 + round((random() * 20)::numeric, 2),
            46.29 + round((random() * 23)::numeric, 2)
        );
    END LOOP;

    -- Campaign 2: Retargeting Conversions (30 days, meta + google)
    FOR d IN SELECT generate_series((CURRENT_DATE - 29), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp2, d, 'meta',
            3000 + floor(random() * 2000)::int,
            90 + floor(random() * 60)::int,
            45.00 + round((random() * 20)::numeric, 2),
            51.75 + round((random() * 23)::numeric, 2),
            59.51 + round((random() * 26)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp2, d, 'google',
            2500 + floor(random() * 1500)::int,
            150 + floor(random() * 90)::int,
            30.00 + round((random() * 15)::numeric, 2),
            34.50 + round((random() * 17)::numeric, 2),
            39.68 + round((random() * 20)::numeric, 2)
        );
    END LOOP;

    -- Campaign 3: Summer Brand Push (21 days, meta + google)
    FOR d IN SELECT generate_series((CURRENT_DATE - 20), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp3, d, 'meta',
            14000 + floor(random() * 6000)::int,
            180 + floor(random() * 100)::int,
            85.00 + round((random() * 40)::numeric, 2),
            97.75 + round((random() * 46)::numeric, 2),
            112.41 + round((random() * 53)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp3, d, 'google',
            10000 + floor(random() * 5000)::int,
            250 + floor(random() * 150)::int,
            65.00 + round((random() * 30)::numeric, 2),
            74.75 + round((random() * 35)::numeric, 2),
            85.96 + round((random() * 40)::numeric, 2)
        );
    END LOOP;

    -- Campaign 4: Lookalike Scale Test (14 days, meta + google)
    FOR d IN SELECT generate_series((CURRENT_DATE - 13), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp4, d, 'meta',
            5000 + floor(random() * 3000)::int,
            70 + floor(random() * 50)::int,
            40.00 + round((random() * 20)::numeric, 2),
            46.00 + round((random() * 23)::numeric, 2),
            52.90 + round((random() * 26)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp4, d, 'google',
            4000 + floor(random() * 2000)::int,
            100 + floor(random() * 70)::int,
            28.00 + round((random() * 14)::numeric, 2),
            32.20 + round((random() * 16)::numeric, 2),
            37.03 + round((random() * 18)::numeric, 2)
        );
    END LOOP;

    -- Campaign 5: Google-Only Search Test (10 days, google only)
    FOR d IN SELECT generate_series((CURRENT_DATE - 9), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp5, d, 'google',
            12000 + floor(random() * 6000)::int,
            350 + floor(random() * 200)::int,
            50.00 + round((random() * 25)::numeric, 2),
            57.50 + round((random() * 29)::numeric, 2),
            66.13 + round((random() * 33)::numeric, 2)
        );
    END LOOP;

    -- Campaign 6: Meta Retargeting Blitz (7 days, meta only)
    FOR d IN SELECT generate_series((CURRENT_DATE - 6), CURRENT_DATE, '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp6, d, 'meta',
            4500 + floor(random() * 2500)::int,
            100 + floor(random() * 70)::int,
            55.00 + round((random() * 28)::numeric, 2),
            63.25 + round((random() * 32)::numeric, 2),
            72.74 + round((random() * 37)::numeric, 2)
        );
    END LOOP;

    -- Campaign 7: Valentine's Promo - PAUSED (46 days of historical data)
    FOR d IN SELECT generate_series((CURRENT_DATE - 60), (CURRENT_DATE - 14), '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp7, d, 'meta',
            6000 + floor(random() * 3000)::int,
            90 + floor(random() * 50)::int,
            42.00 + round((random() * 20)::numeric, 2),
            48.30 + round((random() * 23)::numeric, 2),
            55.55 + round((random() * 26)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp7, d, 'google',
            4000 + floor(random() * 2000)::int,
            120 + floor(random() * 70)::int,
            28.00 + round((random() * 14)::numeric, 2),
            32.20 + round((random() * 16)::numeric, 2),
            37.03 + round((random() * 18)::numeric, 2)
        );
    END LOOP;

    -- Campaign 8: New Year Flash Sale - COMPLETED (30 days of historical data)
    FOR d IN SELECT generate_series((CURRENT_DATE - 85), (CURRENT_DATE - 55), '1 day'::interval)::date LOOP
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp8, d, 'meta',
            9000 + floor(random() * 5000)::int,
            200 + floor(random() * 120)::int,
            70.00 + round((random() * 35)::numeric, 2),
            80.50 + round((random() * 40)::numeric, 2),
            92.58 + round((random() * 46)::numeric, 2)
        );
        INSERT INTO usage_records (campaign_id, date, platform, impressions, clicks, spend_base, spend_kaivo, spend_agency)
        VALUES (
            v_camp8, d, 'google',
            5000 + floor(random() * 3000)::int,
            160 + floor(random() * 100)::int,
            42.00 + round((random() * 20)::numeric, 2),
            48.30 + round((random() * 23)::numeric, 2),
            55.55 + round((random() * 26)::numeric, 2)
        );
    END LOOP;

    RAISE NOTICE 'Demo account created successfully!';
    RAISE NOTICE 'User ID: %, Agency ID: %, Client ID: %', v_user_id, v_agency_id, v_client_id;
    RAISE NOTICE 'Login: demo@kaivo.com / demo1234';

END $$;

COMMIT;
