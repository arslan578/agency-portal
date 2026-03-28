/**
 * Phase 9: Budget Engine - Test Harness
 * 
 * Simple Node test script with no frameworks.
 * Tests pure deterministic logic of budget_engine module.
 */

const { runOrchestrator } = require('../../orchestrator/index');

function buildSampleCampaignPlan() {
    return {
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
            summary: 'Core product is a mid priced fashion line.',
            key_points: [],
            sources: [],
            source_documents: 0
        },
        budget: {
            total: 10000,
            currency: 'USD',
            flight_start: '2025-09-01',
            flight_end: '2025-10-15',
            venue_hints: ['YOUTUBE', 'TIKTOK']
        },
        venues: [
            {
                venue_key: 'YOUTUBE',
                role: 'PRIMARY',
                priority: 1,
                budget_hint: 'HEAVY'
            },
            {
                venue_key: 'TIKTOK',
                role: 'SUPPORTING',
                priority: 2,
                budget_hint: 'MEDIUM'
            }
        ],
        meta: {
            version: 'phase-8.0',
            created_at: '2025-11-25T23:54:15.438Z',
            initiated_by: 'agent',
            source: 'test',
            source_documents: 0
        }
    };
}

async function runPhase9Tests() {
    console.log('============================================================');
    console.log('PHASE 9: BUDGET ENGINE TESTS');
    console.log('============================================================');

    // Test 1: Happy path
    const request1 = {
        module: 'budget_engine', // mapped to target_module
        action: 'optimize',
        input: {
            campaign_plan: buildSampleCampaignPlan()
        }
    };

    const result1 = await runOrchestrator(request1);
    console.log('Test 1 result:', JSON.stringify(result1, null, 2));

    if (!result1.ok) {
        throw new Error('Test 1 failed: expected ok = true');
    }

    const plan = result1.payload && result1.payload.budget_plan;
    if (!plan) {
        throw new Error('Test 1 failed: missing payload.budget_plan');
    }

    if (plan.total_budget !== 10000) {
        throw new Error('Test 1 failed: total_budget mismatch');
    }

    if (!Array.isArray(plan.allocations) || plan.allocations.length !== 2) {
        throw new Error('Test 1 failed: expected 2 allocations');
    }

    // Verify 60/40 split for 2 venues
    const youtube = plan.allocations.find(a => a.venue_key === 'YOUTUBE');
    const tiktok = plan.allocations.find(a => a.venue_key === 'TIKTOK');

    if (youtube.share !== 0.6 || youtube.allocated !== 6000) {
        throw new Error(`Test 1 failed: YOUTUBE share/allocated mismatch. Got ${youtube.share}/${youtube.allocated}`);
    }

    if (tiktok.share !== 0.4 || tiktok.allocated !== 4000) {
        throw new Error(`Test 1 failed: TIKTOK share/allocated mismatch. Got ${tiktok.share}/${tiktok.allocated}`);
    }

    const totalAllocated = plan.summary.total_allocated;
    if (typeof totalAllocated !== 'number') {
        throw new Error('Test 1 failed: total_allocated must be a number');
    }

    // Test 2: Missing campaign_plan
    const request2 = {
        module: 'budget_engine',
        action: 'optimize',
        input: {}
    };
    const result2 = await runOrchestrator(request2);
    console.log('Test 2 result:', JSON.stringify(result2, null, 2));

    if (result2.ok) {
        throw new Error('Test 2 failed: expected ok = false');
    }

    if (!result2.error || result2.error.code !== 'INVALID_INPUT') {
        throw new Error('Test 2 failed: expected INVALID_INPUT error');
    }

    console.log('============================================================');
    console.log('ALL TESTS PASSED');
    console.log('============================================================');
}

// Run tests if executed directly
if (require.main === module) {
    try {
        runPhase9Tests();
    } catch (error) {
        console.error('');
        console.error('✗ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

module.exports = { runPhase9Tests };
