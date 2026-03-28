/**
 * Phase 10: Venue Execution Planner - Test Harness
 * 
 * Simple Node test script with no frameworks.
 * Tests pure deterministic logic of venue_planner module.
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
            segments: [
                { name: 'Gen Z Students', age_min: 18, age_max: 24 }
            ],
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

function buildSampleBudgetPlan() {
    return {
        brand_id: 'brand_123',
        currency: 'USD',
        total_budget: 10000,
        flight_start: '2025-09-01',
        flight_end: '2025-10-15',
        allocations: [
            {
                venue_key: 'YOUTUBE',
                role: 'PRIMARY',
                priority: 1,
                share: 0.6,
                allocated: 6000,
                budget_hint: 'HEAVY',
                flags: []
            },
            {
                venue_key: 'TIKTOK',
                role: 'SUPPORTING',
                priority: 2,
                share: 0.4,
                allocated: 4000,
                budget_hint: 'MEDIUM',
                flags: []
            }
        ],
        summary: {
            total_allocated: 10000,
            unallocated: 0,
            venue_count: 2,
            issues: []
        },
        meta: {
            version: 'phase-9.0',
            created_at: '2025-11-26T00:27:49.705Z',
            source_campaign_version: 'phase-8.0',
            source_campaign_created_at: '2025-11-25T23:54:15.438Z',
            goal_type: 'AWARENESS',
            primary_kpi: 'CPM'
        }
    };
}

async function runPhase10Tests() {
    console.log('============================================================');
    console.log('PHASE 10: VENUE PLANNER TESTS');
    console.log('============================================================');

    // Test 1: Happy path
    const request1 = {
        module: 'venue_planner',
        action: 'plan',
        input: {
            campaign_plan: buildSampleCampaignPlan(),
            budget_plan: buildSampleBudgetPlan()
        }
    };

    const result1 = await runOrchestrator(request1);
    console.log('Test 1 result:', JSON.stringify(result1, null, 2));

    if (!result1.ok) {
        throw new Error('Test 1 failed: expected ok = true');
    }

    const plan = result1.payload && result1.payload.venue_execution_plan;
    if (!plan) {
        throw new Error('Test 1 failed: missing payload.venue_execution_plan');
    }

    if (plan.venues.length !== 2) {
        throw new Error('Test 1 failed: expected 2 venues');
    }

    const youtube = plan.venues.find(v => v.venue_key === 'YOUTUBE');
    if (!youtube || youtube.role !== 'PRIMARY' || youtube.spend.allocated !== 6000) {
        throw new Error('Test 1 failed: YOUTUBE verification failed');
    }

    // Verify creative requirements for TikTok
    const tiktok = plan.venues.find(v => v.venue_key === 'TIKTOK');
    if (!tiktok.creative_requirements.needs_vertical_video) {
        throw new Error('Test 1 failed: TIKTOK should need vertical video');
    }

    // Verify audience notes (Younger skew due to 18-24 segment)
    if (!tiktok.audience_notes.includes('Younger skew')) {
        throw new Error('Test 1 failed: Expected "Younger skew" audience note');
    }

    // Test 2: Missing input
    const request2 = {
        module: 'venue_planner',
        action: 'plan',
        input: {
            campaign_plan: buildSampleCampaignPlan()
            // missing budget_plan
        }
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
        runPhase10Tests();
    } catch (error) {
        console.error('');
        console.error('✗ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

module.exports = { runPhase10Tests };
