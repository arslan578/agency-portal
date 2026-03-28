const { execute } = require('./agent_execution_plan_adapter_engine');

// Mock shared utilities
jest.mock('../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../shared/metrics', () => ({
    count: jest.fn()
}));
jest.mock('../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

describe('Phase 60: Agent Execution Plan Adapter', () => {

    // Setup env
    const originalEnv = process.env;
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, FF_AGENT_EXECUTION_PLAN_ADAPTER: 'true' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // Helper to create base input
    function createBaseInput(overrides = {}) {
        const base = {
            execution_id: "exec_123",
            phase: "60",
            feature_flags: { "FF_AGENT_EXECUTION_PLAN_ADAPTER": true },
            context: {
                tenant_id: "tenant_1",
                trace_domain: "agent_api.v1"
            },
            agent_request: {
                agent_id: "agent_abc",
                intent_type: "CREATE",
                raw_instructions: "Run ads",
                requested_actions: [
                    {
                        venue: "YOUTUBE",
                        budget: { currency: "USD", amount: 100 },
                        objective: "CONVERSIONS"
                    }
                ]
            },
            safety_snapshot: {
                safety_zone: {
                    max_budget_per_venue: { "YOUTUBE": 1000 },
                    max_parallel_connectors: 5
                },
                forbidden_actions: []
            },
            policy_snapshot: {
                policy_version: "v1",
                hard_blocks: []
            },
            capability_index_snapshot: {
                connectors: {
                    "conn_yt": { venue: "YOUTUBE", status: "HEALTHY" }
                }
            },
            rate_limit_snapshot: {
                tenant_bucket: { remaining_requests: 100 },
                agent_bucket: { remaining_requests: 10 },
                per_venue_budgets: { "YOUTUBE": { remaining_monthly_spend: 5000 } }
            },
            optimizer_guard_snapshot: {
                optimizer_plan: null
            }
        };

        // Deep merge overrides (simple version)
        if (overrides.agent_request) Object.assign(base.agent_request, overrides.agent_request);
        if (overrides.safety_snapshot) Object.assign(base.safety_snapshot, overrides.safety_snapshot);
        if (overrides.policy_snapshot) Object.assign(base.policy_snapshot, overrides.policy_snapshot);
        if (overrides.capability_index_snapshot) Object.assign(base.capability_index_snapshot, overrides.capability_index_snapshot);
        if (overrides.rate_limit_snapshot) Object.assign(base.rate_limit_snapshot, overrides.rate_limit_snapshot);
        if (overrides.optimizer_guard_snapshot) Object.assign(base.optimizer_guard_snapshot, overrides.optimizer_guard_snapshot);
        if (overrides.feature_flags !== undefined) base.feature_flags = overrides.feature_flags; // fix structure

        // Handling deep merge efficiently for specific tests
        const mergeDeep = (target, source) => {
            for (const key in source) {
                if (source[key] instanceof Object && key in target) {
                    Object.assign(source[key], mergeDeep(target[key], source[key]));
                }
            }
            Object.assign(target || {}, source);
            return target;
        };
        // Re-do overrides properly
        return mergeDeep(base, overrides);
    }

    // --- Happy Path (6 Tests) ---

    test('Happy 1: Simple YouTube adaptation', async () => {
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('ADAPTED');
        expect(result.adapted_execution_plan.actions).toHaveLength(1);
        expect(result.adapted_execution_plan.actions[0].venue).toBe('YOUTUBE');
        expect(result.adapted_execution_plan.actions[0].connector_id).toBe('conn_yt');
    });

    test('Happy 2: Multiple venues, one blocked by safety', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [
                    { venue: "YOUTUBE", budget: { amount: 100 } },
                    { venue: "TIKTOK", budget: { amount: 100 } }
                ]
            },
            safety_snapshot: {
                forbidden_actions: [{ venue: "TIKTOK" }]
            },
            capability_index_snapshot: {
                connectors: {
                    "conn_yt": { venue: "YOUTUBE", status: "HEALTHY" },
                    "conn_tt": { venue: "TIKTOK", status: "HEALTHY" }
                }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions).toHaveLength(1);
        expect(result.adapted_execution_plan.actions[0].venue).toBe('YOUTUBE');
        expect(result.rejections).toHaveLength(1);
        expect(result.rejections[0].code).toBe('SAFETY_BLOCKED_VENUE');
        // Check dropped_venues (TP1)
        expect(result.agent_safe_response.details.dropped_venues).toHaveLength(1);
        expect(result.agent_safe_response.details.dropped_venues[0]).toEqual({
            venue: "TIKTOK",
            reason_code: "SAFETY_BLOCKED_VENUE"
        });
    });

    test('Tightening 1: Inner validation missing agent_id', async () => {
        const input = createBaseInput();
        delete input.agent_request.agent_id;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_REQUEST');
        expect(result.adapter_decision.reasons).toContain('MISSING_AGENT_ID');
    });

    test('Happy 3: Multiple venues, one blocked by policy', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [
                    { venue: "YOUTUBE", budget: { amount: 100 } },
                    { venue: "TIKTOK", budget: { amount: 100 } }
                ]
            },
            policy_snapshot: {
                hard_blocks: [{ venue: "TIKTOK" }]
            },
            capability_index_snapshot: {
                connectors: {
                    "conn_yt": { venue: "YOUTUBE", status: "HEALTHY" },
                    "conn_tt": { venue: "TIKTOK", status: "HEALTHY" }
                }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.rejections[0].code).toBe('POLICY_BLOCKED_VENUE');
        expect(result.adapted_execution_plan.actions).toHaveLength(1);
    });

    test('Happy 4: Budget trimmed by safety zone', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [{ venue: "YOUTUBE", budget: { amount: 2000 } }]
            },
            safety_snapshot: {
                safety_zone: { max_budget_per_venue: { "YOUTUBE": 1000 } }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].budget.amount).toBe(1000);
        expect(result.adapted_execution_plan.actions[0].safety_tags).toContain('BUDGET_CLAMPED');
    });

    test('Happy 5: Budget trimmed by rate limit', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [{ venue: "YOUTUBE", budget: { amount: 6000 } }]
            },
            rate_limit_snapshot: {
                per_venue_budgets: { "YOUTUBE": { remaining_monthly_spend: 5000 } }
            },
            safety_snapshot: {
                safety_zone: { max_budget_per_venue: { "YOUTUBE": 10000 } } // Ensure safety doesn't clamp first
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].budget.amount).toBe(5000);
    });

    test('Happy 6: Optimizer guard plan respected', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [{ venue: "YOUTUBE", budget: { amount: 1000 } }]
            },
            optimizer_guard_snapshot: {
                optimizer_plan: {
                    venue_budgets: { "YOUTUBE": 500 },
                    allowed_connectors: ["conn_yt"]
                }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].budget.amount).toBe(500);
    });

    // --- Negative Path (6 Tests) ---

    test('Negative 1: Feature flag disabled', async () => {
        process.env.FF_AGENT_EXECUTION_PLAN_ADAPTER = 'false';
        const input = createBaseInput();
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
    });

    test('Negative 2: Missing required fields', async () => {
        const input = createBaseInput();
        delete input.agent_request;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_REQUEST');
    });

    test('Negative 3: Forbidden field present', async () => {
        const input = createBaseInput();
        input.direct_connector_calls = true;
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_REQUEST');
    });

    test('Negative 4: Policy hard block on all requested venues', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [{ venue: "TIKTOK" }]
            },
            policy_snapshot: {
                hard_blocks: [{ venue: "TIKTOK" }]
            },
            capability_index_snapshot: {
                connectors: { "conn_tt": { venue: "TIKTOK", status: "HEALTHY" } }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('POLICY_BLOCKED');
    });

    test('Negative 5: Rate limit exceeded', async () => {
        const input = createBaseInput({
            rate_limit_snapshot: { agent_bucket: { remaining_requests: 0 } }
        });
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('RATE_LIMIT_BLOCKED');
    });

    test('Negative 6: Capability block (no viable connector)', async () => {
        const input = createBaseInput({
            capability_index_snapshot: { connectors: {} } // No connectors
        });
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('CAPABILITY_BLOCKED');
    });

    // --- Edge Cases (4 Tests) ---

    test('Edge 1: Empty requested_actions', async () => {
        const input = createBaseInput();
        input.agent_request.requested_actions = [];
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('INVALID_REQUEST');
        expect(result.adapter_decision.reasons).toContain('NO_REQUESTED_ACTIONS');
    });

    test('Edge 2: Degenerated safety snapshot (no max budgets)', async () => {
        const input = createBaseInput({
            safety_snapshot: { safety_zone: {} }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].budget.amount).toBe(100);
    });

    test('Edge 3: Capability degraded but still allowed', async () => {
        const input = createBaseInput({
            capability_index_snapshot: {
                connectors: { "conn_yt": { venue: "YOUTUBE", status: "DEGRADED" } }
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].safety_tags).toContain('CONNECTOR_DEGRADED');
    });

    test('Edge 4: Optimizer guard missing (preflight)', async () => {
        const input = createBaseInput({
            optimizer_guard_snapshot: { optimizer_plan: null }
        });
        const result = await execute(input);
        expect(result.ok).toBe(true);
        expect(result.adapted_execution_plan.actions[0].budget.amount).toBe(100);
    });

    // --- Regression Guards (2 Tests) ---

    test('Regression 1: Status precedence', async () => {
        // Trigger POLICY and SAFETY blocks. Policy should win.
        const input = createBaseInput({
            agent_request: {
                requested_actions: [
                    { venue: "BLOCKED_BOTH", budget: { amount: 1 } }
                ]
            },
            policy_snapshot: {
                hard_blocks: [{ venue: "BLOCKED_BOTH" }]
            },
            safety_snapshot: {
                forbidden_actions: [{ venue: "BLOCKED_BOTH" }]
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(false);
        // Policy > Safety
        expect(result.status).toBe('POLICY_BLOCKED');
    });

    test('Regression 2: Rejection sorting', async () => {
        const input = createBaseInput({
            agent_request: {
                requested_actions: [
                    { venue: "C_BAD", budget: { amount: 1 } },
                    { venue: "A_BAD", budget: { amount: 1 } },
                    { venue: "B_BAD", budget: { amount: 1 } }
                ]
            },
            policy_snapshot: {
                hard_blocks: [{ venue: "C_BAD" }, { venue: "A_BAD" }, { venue: "B_BAD" }]
            }
        });
        const result = await execute(input);
        expect(result.ok).toBe(false);
        expect(result.rejections).toHaveLength(3);
        // Should be sorted by code then field. 
        // Code is same (POLICY_BLOCKED_VENUE). Field actions[0], actions[1], actions[2] are indices based on input order.
        // Wait, spec says: "rejections sorted by code then field."
        // Our input order was C(0), A(1), B(2).
        // Validation loop processes 0, 1, 2.
        // Field names "actions[0]", "actions[1]", "actions[2]".
        // Sort order "actions[0]", "actions[1]", "actions[2]".
        // This effectively sorts by input index.
        expect(result.rejections[0].field).toBe('actions[0].venue');
        expect(result.rejections[1].field).toBe('actions[1].venue');
        expect(result.rejections[2].field).toBe('actions[2].venue');
    });

    // --- Determinism (2 Tests) ---

    test('Determinism 1: Repeated runs', async () => {
        const input = createBaseInput();
        const run1 = JSON.stringify(await execute(input));
        for (let i = 0; i < 50; i++) {
            const runN = JSON.stringify(await execute(input));
            expect(runN).toBe(run1);
        }
    });

    test('Determinism 2: Action ordering', async () => {
        // Input shuffled, Output sorted
        const input = createBaseInput();
        input.agent_request.requested_actions = [
            { action_id: "agent_002", venue: "YOUTUBE", budget: { amount: 10 } },
            { action_id: "agent_001", venue: "YOUTUBE", budget: { amount: 10 } }
        ];
        const result = await execute(input);
        expect(result.adapted_execution_plan.actions[0].action_id).toBe('agent_001');
        expect(result.adapted_execution_plan.actions[1].action_id).toBe('agent_002');
    });

});
