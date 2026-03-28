const { execute } = require('../phase_72_multi_agent_conflict_arbitration');

// Mock Dependencies
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    count: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

describe('Phase 72: Multi-Agent Conflict Arbitration', () => {

    const PHASE_ID = '72';
    const FEATURE_FLAG = 'FF_MULTI_AGENT_CONFLICT_ARBITRATION';

    function createBaseInput() {
        return {
            execution_id: 'exec_test_001',
            phase: '72',
            feature_flags: { [FEATURE_FLAG]: true },
            agent_claims: {
                agent_a: { priority_score: 10, connectors_requested: ['conn_1'], budget_requested: { amount: 100 } },
                agent_b: { priority_score: 5, connectors_requested: ['conn_1'], budget_requested: { amount: 50 } }
            },
            policy_rules: {
                budget_allocation: {
                    agent_a: { max_amount: 200 }
                },
                timeline_allocation: {
                    allow_overlap: false
                }
            },
            knowledge_caps: {
                conn_1: { max_concurrent_agents: 1 } // Only 1 allowed
            }
        };
    }

    // --- Validation Tests ---

    test('Returns VALIDATION_FAILED for null input', () => {
        const result = execute(null);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.error.code).toBe('INVALID_INPUT');
    });

    test('Returns VALIDATION_FAILED for missing execution_id', () => {
        const input = createBaseInput();
        delete input.execution_id;
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.error.code).toBe('INVALID_EXECUTION_ID');
    });

    test('Returns VALIDATION_FAILED for wrong phase', () => {
        const input = createBaseInput();
        input.phase = '71';
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.error.code).toBe('INVALID_PHASE');
    });

    test('Returns FEATURE_DISABLED when flag is off', () => {
        const input = createBaseInput();
        input.feature_flags[FEATURE_FLAG] = false;
        const result = execute(input);
        expect(result.status).toBe('FEATURE_DISABLED');
        expect(result.arbitration_result).toBeDefined(); // Should return empty result
    });

    test('Returns VALIDATION_FAILED for missing agent_claims', () => {
        const input = createBaseInput();
        delete input.agent_claims;
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.error.code).toBe('INVALID_AGENT_CLAIMS');
    });

    // --- Arbitration Logic Tests ---

    test('Arbitrates Connector Capacity (Priority A > B)', () => {
        const input = createBaseInput();
        // Agent A (10) vs Agent B (5). Cap 1.

        const result = execute(input);

        expect(result.status).toBe('SUCCESS');
        const connectors = result.arbitration_result.connector_assignments;

        // Agent A should get it
        expect(connectors['conn_1']).toEqual(['agent_a']);

        // Logs should show denial for B
        const log = result.arbitration_result.arbitration_log;
        const logB = log.find(l => l.agent_id === 'agent_b');
        expect(logB.decisions).toContain('Connector conn_1: DENIED (CONNECTOR_CAPACITY_EXCEEDED)');
    });

    test('Arbitrates Budget Limits (Capping)', () => {
        const input = createBaseInput();
        input.agent_claims.agent_a.budget_requested.amount = 300; // > Max 200

        const result = execute(input);
        const assignment = result.arbitration_result.budget_assignments.agent_a;

        expect(assignment.approved_amount).toBe(200); // Capped
        expect(assignment.denied_reasons).toContain('BUDGET_LIMIT_EXCEEDED');
    });

    test('Arbitrates Timeline Overlap (Start/End Conflict)', () => {
        const input = createBaseInput();
        input.agent_claims.agent_a.timeline_requested = { start_block: 10, end_block: 20 };
        input.agent_claims.agent_b.timeline_requested = { start_block: 15, end_block: 25 }; // Overlaps

        const result = execute(input);
        const timeline = result.arbitration_result.timeline_assignments;

        // Agent A (High Pri) gets Approved
        expect(timeline.agent_a.start_block).toBe(10);
        expect(timeline.agent_a.denied_reasons).toEqual([]);

        // Agent B (Low Pri) gets Denied
        expect(timeline.agent_b.denied_reasons).toContain('TIMELINE_CONFLICT');
    });

    test('Allow Timeline Overlap when Policy Permits', () => {
        const input = createBaseInput();
        input.policy_rules.timeline_allocation.allow_overlap = true;
        input.agent_claims.agent_a.timeline_requested = { start_block: 10, end_block: 20 };
        input.agent_claims.agent_b.timeline_requested = { start_block: 15, end_block: 25 };

        const result = execute(input);
        const timeline = result.arbitration_result.timeline_assignments;

        expect(timeline.agent_a.denied_reasons).toEqual([]);
        expect(timeline.agent_b.denied_reasons).toEqual([]);
    });

    // --- Determinism Tests ---

    test('Output shapes are sorted deterministically', () => {
        const input = createBaseInput();
        // Add arbitrary connector IDs that need sorting
        input.agent_claims.agent_a.connectors_requested = ['z_conn', 'a_conn'];
        input.knowledge_caps.z_conn = { max_concurrent_agents: 10 };
        input.knowledge_caps.a_conn = { max_concurrent_agents: 10 };

        const result = execute(input);
        const assignmentKeys = Object.keys(result.arbitration_result.connector_assignments);

        // Expect keys sorted alphabetically
        expect(assignmentKeys).toEqual(['a_conn', 'conn_1', 'z_conn']);
    });

    test('Sorting Priority Stability (Priority Tiers)', () => {
        const input = createBaseInput();
        // 3 Agents. A=10, B=10, C=5.
        // A vs B tie-break on ID. A < B. So A first, then B.
        input.agent_claims.agent_c = { priority_score: 5, connectors_requested: ['conn_shared'] };
        input.agent_claims.agent_b = { priority_score: 10, connectors_requested: ['conn_shared'] };
        input.agent_claims.agent_a = { priority_score: 10, connectors_requested: ['conn_shared'] };

        input.knowledge_caps.conn_shared = { max_concurrent_agents: 2 };

        const result = execute(input);

        // A and B should get it (Priority 10). C denied (Priority 5, capacity 2 filled by A&B).
        const log = result.arbitration_result.arbitration_log;

        // Verify Log Order matches processing order (A -> B -> C)
        expect(log[0].agent_id).toBe('agent_a');
        expect(log[1].agent_id).toBe('agent_b');
        expect(log[2].agent_id).toBe('agent_c');

        expect(result.arbitration_result.connector_assignments.conn_shared).toEqual(['agent_a', 'agent_b']);
    });

});
