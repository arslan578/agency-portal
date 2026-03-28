/**
 * Phase 8: Campaign Plan Composer - Test Harness
 * 
 * Simple Node test script with no frameworks.
 * Tests pure composition logic of campaign_planner module.
 */

const { runOrchestrator } = require('../../orchestrator/index');

async function runPhase8Test() {
    console.log('='.repeat(60));
    console.log('PHASE 8: CAMPAIGN PLAN COMPOSER TESTS');
    console.log('='.repeat(60));
    console.log('');

    const request = {
        type: 'CAMPAIGN_BUILD_PLAN',
        payload: {
            brand_id: 'brand_123',
            campaign_goal: {
                type: 'AWARENESS',
                primary_kpi: 'CPM'
            },
            brief: {
                raw_text: 'Drive awareness for our new fall product line.',
                language: 'en'
            },
            audience: {
                // Minimal stub reflecting Phase 7 pattern
                audience_type: 'INFERRED',
                segments: [],
                brand_id: 'brand_123',
                campaign_goal: {
                    type: 'AWARENESS',
                    primary_kpi: 'CPM'
                },
                meta: {
                    source_documents: 0
                }
            },
            creative: {
                hooks: ['New season, new look'],
                primary_offer: 'Free shipping on all fall items',
                call_to_actions: ['Shop now']
            },
            knowledge: {
                summary: 'Core product is a mid-priced fashion line for working adults.',
                key_points: ['Fall launch', 'Free shipping', 'Working professionals'],
                sources: []
            },
            budget: {
                total: 10000,
                currency: 'USD',
                flight_start: '2025-09-01',
                flight_end: '2025-10-15',
                venue_hints: ['YOUTUBE', 'TIKTOK']
            },
            meta: {
                initiated_by: 'agent',
                source: 'test'
            }
        }
    };

    console.log('Test 1: Happy path - full campaign plan composition');
    const result = await runOrchestrator(request);

    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // Assertions
    if (!result.ok) {
        throw new Error('Expected ok = true');
    }

    const plan = result.payload && result.payload.campaign_plan;
    if (!plan) {
        throw new Error('Missing payload.campaign_plan');
    }

    if (plan.brand_id !== 'brand_123') {
        throw new Error(`brand_id mismatch: expected 'brand_123', got '${plan.brand_id}'`);
    }

    if (!plan.campaign_goal || plan.campaign_goal.type !== 'AWARENESS') {
        throw new Error('campaign_goal mismatch');
    }

    if (!plan.knowledge || plan.knowledge.source_documents !== 0) {
        throw new Error(`knowledge.source_documents should be 0 when sources is empty, got ${plan.knowledge?.source_documents}`);
    }

    if (!plan.meta || plan.meta.source_documents !== 0) {
        throw new Error(`meta.source_documents should mirror knowledge.source_documents, got ${plan.meta?.source_documents}`);
    }

    if (!plan.venues || plan.venues.length !== 2) {
        throw new Error(`Expected 2 venues from hints ['YOUTUBE', 'TIKTOK'], got ${plan.venues?.length}`);
    }

    if (plan.venues[0].venue_key !== 'YOUTUBE' || plan.venues[0].role !== 'PRIMARY') {
        throw new Error('First venue should be YOUTUBE with role PRIMARY');
    }

    if (plan.venues[1].venue_key !== 'TIKTOK' || plan.venues[1].role !== 'SUPPORTING') {
        throw new Error('Second venue should be TIKTOK with role SUPPORTING');
    }

    console.log('✓ Test 1 PASSED');
    console.log('');

    // Test 2: Zero documents with sources array present
    console.log('Test 2: Knowledge with populated sources');
    const request2 = {
        type: 'CAMPAIGN_BUILD_PLAN',
        payload: {
            brand_id: 'brand_456',
            campaign_goal: {
                type: 'LEADS',
                primary_kpi: 'CPL',
                secondary_kpi: 'CTR'
            },
            brief: {
                raw_text: 'Generate leads for Q4 campaign'
            },
            audience: {
                brand_id: 'brand_456',
                campaign_goal: { type: 'LEADS', primary_kpi: 'CPL' }
            },
            knowledge: {
                summary: 'Product knowledge summary',
                sources: [
                    { id: 'doc_1', title: 'Product Guide' },
                    { id: 'doc_2', title: 'Pricing Sheet' }
                ]
            }
        }
    };

    const result2 = await runOrchestrator(request2);
    const plan2 = result2.payload?.campaign_plan;

    if (!plan2 || plan2.knowledge.source_documents !== 2) {
        throw new Error(`Expected source_documents = 2, got ${plan2?.knowledge?.source_documents}`);
    }

    if (plan2.meta.source_documents !== 2) {
        throw new Error(`Expected meta.source_documents = 2, got ${plan2?.meta?.source_documents}`);
    }

    console.log('✓ Test 2 PASSED');
    console.log('');

    // Test 3: Missing required fields
    console.log('Test 3: Missing required field validation');
    const request3 = {
        type: 'CAMPAIGN_BUILD_PLAN',
        payload: {
            brand_id: 'brand_789',
            // Missing campaign_goal
            brief: {
                raw_text: 'Test'
            },
            audience: {}
        }
    };

    const result3 = await runOrchestrator(request3);

    if (result3.ok !== false) {
        throw new Error('Expected ok = false for missing campaign_goal');
    }

    if (result3.error?.code !== 'INVALID_INPUT') {
        throw new Error(`Expected error code INVALID_INPUT, got ${result3.error?.code}`);
    }

    console.log('✓ Test 3 PASSED');
    console.log('');

    console.log('='.repeat(60));
    console.log('ALL TESTS PASSED');
    console.log('='.repeat(60));
}

// Run tests if executed directly
if (require.main === module) {
    try {
        runPhase8Test();
    } catch (error) {
        console.error('');
        console.error('✗ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

module.exports = { runPhase8Test };
