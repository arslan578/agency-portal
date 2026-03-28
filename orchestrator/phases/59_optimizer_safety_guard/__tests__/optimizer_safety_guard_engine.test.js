/**
 * Phase 59: Optimizer Safety Guard Engine - Test Suite
 * 
 * Comprehensive test coverage for Forward-Hardening compliance:
 * - 6 Happy Path tests
 * - 6 Negative tests
 * - 5 Edge Case tests
 * - 1 Regression Guard
 * - 1 Determinism Guard
 * Total: 19 tests
 */

const { execute } = require('../optimizer_safety_guard_engine');

// Mock shared utilities
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));

jest.mock('../../../shared/metrics', () => ({
    metrics: {
        count: jest.fn(),
        gauge: jest.fn()
    }
}));

jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

// --- Helper Functions ---

function createMockInput() {
    process.env.FF_OPTIMIZER_SAFETY_GUARD = 'true';
    return {
        execution_id: 'exec_123',
        phase: '59',
        feature_flags: {
            FF_OPTIMIZER_SAFETY_GUARD: true
        },
        context: {
            tenant_id: 'tenant_abc',
            workspace_id: 'workspace_xyz',
            brand_id: 'brand_123',
            trace_domain: 'test',
            policy_version: 'v1'
        },
        optimizer_plan: {
            plan_id: 'plan_001',
            steps: [
                {
                    step_id: 'step_1',
                    connector_id: 'meta_ads',
                    action_type: 'BUDGET_REALLOCATE',
                    budget_delta: 250.0,
                    tags: [],
                    metadata: {}
                }
            ],
            metadata: {
                optimizer_run_id: 'opt_run_123'
            }
        },
        connector_state: {
            contract_version: 'global_connector_state_v1',
            connectors: {
                meta_ads: {
                    health: 'HEALTHY',
                    capabilities: {}
                }
            }
        },
        safety_horizon: {
            contract_version: 'safety_horizon_v1',
            safety_zone: {
                overall_risk_level: 'LOW',
                allowed_risk_bands: ['LOW', 'MEDIUM']
            },
            safe_execution_horizon: {
                max_budget_delta_total: 10000.0,
                max_budget_delta_per_connector: 3000.0,
                max_parallel_connectors: 5,
                max_steps_per_plan: 100
            },
            forbidden_actions: [],
            redundancy_profile: {
                connectors_with_redundancy: [],
                connectors_without_redundancy: []
            },
            risk_ledger: []
        }
    };
}

describe('Phase 59: Optimizer Safety Guard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.FF_OPTIMIZER_SAFETY_GUARD = 'true';
    });

    // --- Happy Path Tests (6) ---

    test('Happy 1 – All steps safe', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'google_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 150.0 }
        ];

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.violations).toHaveLength(0);
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(2);
        expect(result.summary.total_steps_blocked).toBe(0);

        // PATCH 8: Snapshot assertions
        expect(result.snapshot_overlay.per_step_decisions.step_1.decision).toBe('SAFE');
        expect(Array.isArray(result.snapshot_overlay.per_step_decisions.step_1.reason_codes)).toBe(true);
    });

    test('Happy 2 – Single clamped step', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 4000.0 }
        ];
        input.safety_horizon.safe_execution_horizon.max_budget_delta_per_connector = 3000.0;

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(1);
        expect(result.optimizer_plan_sanitized.steps[0].budget_delta).toBe(3000.0);
        expect(result.optimizer_plan_sanitized.steps[0].tags).toContain('clamped_by_safety_guard');
        expect(result.optimizer_plan_sanitized.steps[0].metadata.safety_guard_decision).toBe('CLAMPED');
        expect(result.violations).toHaveLength(0);

        // PATCH 8: Snapshot assertions
        expect(result.snapshot_overlay.per_step_decisions.step_1.decision).toBe('CLAMPED');
        expect(Array.isArray(result.snapshot_overlay.per_step_decisions.step_1.reason_codes)).toBe(true);
    });

    test('Happy 3 – Mix of safe and blocked by forbidden_actions', () => {
        // PATCH 6: Fix typo - step__id -> step_id
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'tiktok_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 200.0 }
        ];
        input.safety_horizon.forbidden_actions = [
            {
                connector_id: 'tiktok_ads',
                blocked_action_types: ['BUDGET_REALLOCATE', 'NEW_CAMPAIGN']
            }
        ];

        const result = execute(input);

        // PATCH 1: Expect SAFETY_VIOLATION due to violations
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(1);
        expect(result.optimizer_plan_sanitized.steps[0].connector_id).toBe('meta_ads');
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].violation_type).toBe('FORBIDDEN_ACTION');
        expect(result.violations[0].step_id).toBe('step_2');
        expect(result.summary.has_safety_violations).toBe(true);
    });

    test('Happy 4 – Budget adjustments clamped', () => {
        // PATCH 3: Actually test clamping
        const input = createMockInput();
        input.budget_adjustments = {
            entries: [
                { entry_id: 'entry_1', connector_id: 'meta_ads', budget_delta: 4000.0 }
            ]
        };
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 200.0 }
        ];
        input.safety_horizon.safe_execution_horizon.max_budget_delta_per_connector = 3000.0;

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.budget_adjustments_sanitized.entries).toHaveLength(1);
        // PATCH 3: Budget adjustment should be clamped to  fit within connector limit
        expect(result.budget_adjustments_sanitized.entries[0].budget_delta).toBe(2800.0); // 3000 - 200 from step
        expect(result.budget_adjustments_sanitized.entries[0].metadata.safety_guard_decision).toBe('CLAMPED');
        expect(result.budget_adjustments_sanitized.summary.total_budget_delta_input).toBe(4200.0);
        expect(result.budget_adjustments_sanitized.summary.total_budget_delta_after_guard).toBe(3000.0);
    });

    test('Happy 5 – Redundancy profile used', () => {
        // PATCH 4: Test redundancy semantics
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'tiktok_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 150.0 }
        ];
        input.safety_horizon.risk_ledger = [
            { connector_id: 'tiktok_ads', risk_level: 'HIGH' },
            { connector_id: 'meta_ads', risk_level: 'HIGH' }
        ];
        input.safety_horizon.safety_zone.allowed_risk_bands = ['LOW'];
        input.safety_horizon.redundancy_profile = {
            connectors_with_redundancy: ['meta_ads'],
            connectors_without_redundancy: ['tiktok_ads']
        };

        const result = execute(input);

        // PATCH 1: Expect SAFETY_VIOLATION due to tiktok_ads blocking
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');

        // PATCH 4: tiktok_ads (no redundancy + high risk) should be BLOCKED
        expect(result.violations.some(v => v.connector_id === 'tiktok_ads')).toBe(true);
        expect(result.optimizer_plan_sanitized.steps.some(s => s.connector_id === 'tiktok_ads')).toBe(false);

        // PATCH 4: meta_ads (with redundancy + high risk) should be CLAMPED to 0
        const metaStep = result.optimizer_plan_sanitized.steps.find(s => s.connector_id === 'meta_ads');
        expect(metaStep).toBeDefined();
        expect(metaStep.budget_delta).toBe(0);
        expect(metaStep.metadata.safety_guard_decision).toBe('CLAMPED');
        expect(result.snapshot_overlay.per_step_decisions.step_1.reason_codes).toContain('REDUNDANCY_SOFTENED_HIGH_RISK');
    });

    test('Happy 6 – Feature flag disabled pass through', () => {
        const input = createMockInput();
        process.env.FF_OPTIMIZER_SAFETY_GUARD = 'false';

        const result = execute(input);

        expect(result.status).toBe('FEATURE_DISABLED');
        expect(result.feature_flag_enabled).toBe(false);
        expect(result.stop_reason).toBe('FEATURE_DISABLED');
        expect(result.violations).toHaveLength(0);
        expect(result.optimizer_plan_sanitized.steps).toEqual(result.optimizer_plan_original.steps);

        // CONFORMANCE: Assert unguarded annotation
        expect(result.optimizer_plan_sanitized.metadata).toBeDefined();
        expect(result.optimizer_plan_sanitized.metadata.safety_guard_annotation).toEqual({
            guard_applied: false,
            reason: 'FEATURE_DISABLED',
            total_steps_input: 1,
            total_steps_sanitized: 1,
            total_steps_blocked: 0
        });
    });

    // --- Negative Path Tests (6) ---

    test('Negative 1 – Missing required field', () => {
        const input = createMockInput();
        delete input.safety_horizon;

        const result = execute(input);

        expect(result.status).toBe('INVALID_INPUT');
        expect(result.stop_reason).toBe('CONTRACT_VIOLATION');
        expect(result.error).toContain('safety_horizon');
    });

    test('Negative 2 – Unknown top level field', () => {
        const input = createMockInput();
        input.unexpected_field = 'should_fail';

        const result = execute(input);

        expect(result.status).toBe('INVALID_INPUT');
        expect(result.error).toContain('unexpected_field');
    });

    test('Negative 3 – Invalid type in steps', () => {
        // PATCH 2: Expect INVALID_INPUT for non-numeric budget_delta
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 'invalid_string' }
        ];

        const result = execute(input);

        expect(result.status).toBe('INVALID_INPUT');
        expect(result.stop_reason).toBe('CONTRACT_VIOLATION');
        expect(result.error).toContain('Invalid budget_delta');
    });

    test('Negative 4 – Conflicting safety horizon values', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 1000.0 }
        ];
        input.safety_horizon.safe_execution_horizon.max_budget_delta_total = 0.0;
        input.safety_horizon.safe_execution_horizon.max_budget_delta_per_connector = 500.0;

        const result = execute(input);

        // CONFORMANCE: Expect SAFETY_VIOLATION with GLOBAL_BUDGET_EXCEEDED  
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(0);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].violation_type).toBe('GLOBAL_BUDGET_EXCEEDED');
        expect(result.summary.has_safety_violations).toBe(true);
    });

    test('Negative 5 – Risk band violation', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 }
        ];
        input.safety_horizon.safety_zone.allowed_risk_bands = ['LOW'];
        input.safety_horizon.risk_ledger = [
            { connector_id: 'meta_ads', risk_level: 'HIGH' }
        ];
        // PATCH 4: No redundancy means BLOCKED
        input.safety_horizon.redundancy_profile = {
            connectors_with_redundancy: [],
            connectors_without_redundancy: ['meta_ads']
        };

        const result = execute(input);

        // PATCH 1: Expect SAFETY_VIOLATION
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(0);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].violation_type).toBe('HIGH_RISK');
    });

    test('Negative 6 – Internal exception protection', () => {
        const input = null; // Will cause error

        const result = execute(input);

        expect(result.status).toBe('INTERNAL_ERROR');
        expect(result.stop_reason).toBe('UNEXPECTED_EXCEPTION');
        expect(result.error).toBeTruthy();
    });

    // --- Edge Case Tests (4) ---

    test('Edge 1 – Empty plan', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [];

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.summary.total_steps_input).toBe(0);
        expect(result.summary.total_steps_sanitized).toBe(0);
        expect(result.summary.total_steps_blocked).toBe(0);
        expect(result.violations).toHaveLength(0);
    });

    test('Edge 2a – Max steps at boundary passes', () => {
        const input = createMockInput();
        input.safety_horizon.safe_execution_horizon.max_steps_per_plan = 3;
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_3', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 }
        ];

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(3);
        expect(result.violations).toHaveLength(0);
        expect(result.summary.total_steps_input).toBe(3);
        expect(result.summary.total_steps_sanitized).toBe(3);
        expect(result.summary.total_steps_blocked).toBe(0);
    });

    test('Edge 2 – Max steps boundary', () => {
        const input = createMockInput();
        input.safety_horizon.safe_execution_horizon.max_steps_per_plan = 3;
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_3', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_4', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 }
        ];

        const result = execute(input);

        // PATCH 1: Expect SAFETY_VIOLATION
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(3);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].violation_type).toBe('MAX_STEPS_EXCEEDED');
    });

    test('Edge 3 – Zero budgets', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 0.0 },
            { step_id: 'step_2', connector_id: 'google_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 0.0 }
        ];

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(2);
        expect(result.violations).toHaveLength(0);
        expect(result.summary.total_budget_delta_after_guard).toBe(0);
    });

    test('Edge 4 – Multiple connectors, shared limits', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 2999.0 },
            { step_id: 'step_2', connector_id: 'google_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 2999.0 },
            { step_id: 'step_3', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 2.0 }
        ];
        input.safety_horizon.safe_execution_horizon.max_budget_delta_per_connector = 3000.0;

        const result = execute(input);

        expect(result.status).toBe('OK');
        expect(result.optimizer_plan_sanitized.steps).toHaveLength(3);
        expect(result.optimizer_plan_sanitized.steps[0].budget_delta).toBe(2999.0);
        expect(result.optimizer_plan_sanitized.steps[1].budget_delta).toBe(2999.0);
        expect(result.optimizer_plan_sanitized.steps[2].budget_delta).toBe(1.0); // Clamped
        expect(result.optimizer_plan_sanitized.steps[2].metadata.safety_guard_decision).toBe('CLAMPED');
    });

    // --- Regression Guard ---

    test('Regression 1 – Forbidden actions never slip through', () => {
        // Protects against future refactorings that might accidentally ignore forbidden actions
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'tiktok_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 },
            { step_id: 'step_2', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 100.0 }
        ];
        input.safety_horizon.forbidden_actions = [
            {
                connector_id: 'tiktok_ads',
                blocked_action_types: ['BUDGET_REALLOCATE']
            }
        ];

        const result = execute(input);

        // PATCH 1: Expect SAFETY_VIOLATION
        expect(result.status).toBe('SAFETY_VIOLATION');
        expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');

        // Assert step_1 never appears in sanitized plan
        const sanitizedStepIds = result.optimizer_plan_sanitized.steps.map(s => s.step_id);
        expect(sanitizedStepIds).not.toContain('step_1');
        expect(sanitizedStepIds).toContain('step_2');

        // Assert step_1 appears in violations
        const violationStepIds = result.violations.map(v => v.step_id);
        expect(violationStepIds).toContain('step_1');
        expect(result.violations[0].violation_type).toBe('FORBIDDEN_ACTION');
    });

    // --- Determinism Guard ---

    test('Determinism – Repeated invocations identical', () => {
        const input = createMockInput();
        input.optimizer_plan.steps = [
            { step_id: 'step_1', connector_id: 'meta_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 250.0 },
            { step_id: 'step_2', connector_id: 'google_ads', action_type: 'BUDGET_REALLOCATE', budget_delta: 300.0 }
        ];

        const results = [];
        for (let i = 0; i < 100; i++) {
            results.push(execute(input));
        }

        // Deep compare all results
        const firstResult = JSON.stringify(results[0]);
        for (let i = 1; i < 100; i++) {
            expect(JSON.stringify(results[i])).toBe(firstResult);
        }
    });
});
