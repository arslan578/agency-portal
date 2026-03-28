const { execute } = require('../phase_71_agent_time_execution_scheduler');

// Mock Observability
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

describe('Phase 71: Agent-Time Execution Scheduler (TP1)', () => {

    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...ORIGINAL_ENV };
        process.env.FF_AGENT_TIME_EXECUTION_SCHEDULER = 'true';
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    function createBaseInput(overrides = {}) {
        const base = {
            execution_id: 'exec_phase_71_test',
            phase: '71',
            feature_flags: { FF_AGENT_TIME_EXECUTION_SCHEDULER: true },
            rate_limit_snapshot: {},
            tenant_context: {
                tenant_a: {
                    priority: 10,
                    weight: 2.0,
                    max_concurrent_agents: 1,
                    max_slices_per_window: 100,
                    rate_limits: { per_minute: 100, per_hour: 1000 }
                },
                tenant_b: {
                    priority: 5,
                    weight: 1.0,
                    max_concurrent_agents: 1,
                    max_slices_per_window: 100,
                    rate_limits: { per_minute: 100, per_hour: 1000 }
                }
            },
            agent_queue: {
                req_a1: {
                    tenant_id: 'tenant_a',
                    agent_id: 'agent_a',
                    requested_at: '2025-12-06T20:00:00.000Z',
                    deadline_at: '2025-12-06T21:00:00.000Z',
                    priority: 5,
                    requested_connectors: ['google_ads'],
                    estimated_cost_units: 10
                },
                req_b1: {
                    tenant_id: 'tenant_b',
                    agent_id: 'agent_b',
                    requested_at: '2025-12-06T20:00:00.000Z',
                    deadline_at: '2025-12-06T21:00:00.000Z',
                    priority: 5,
                    requested_connectors: ['meta_ads'],
                    estimated_cost_units: 8
                }
            },
            time_window: {
                start_logical_time: 1000,
                end_logical_time: 2000,
                slice_ms: 100
            },
            scheduler_config: {
                fairness_mode: 'WEIGHTED_ROUND_ROBIN',
                max_slices_per_agent: 10,
                max_slices_per_request: 5,
                max_total_slices: 10,
                default_tenant_weight: 1.0,
                default_tenant_priority: 1,
                default_agent_priority: 1
            },
            prior_schedule_state: {
                tenant_slices: {},
                request_slices: {}
            },
            _debug: { trace_domain: 'TEST' }
        };
        return { ...base, ...overrides };
    }

    // --- Happy Paths ---

    test('1. Schedules Slots for Two Tenants (Weighted Round Robin)', () => {
        const input = createBaseInput();
        const result = execute(input);
        expect(result.ok).toBe(true);
        expect(result.scheduled_slots.length).toBeLessThanOrEqual(10);
        const slotsA = result.scheduled_slots.filter(s => s.tenant_id === 'tenant_a').length;
        const slotsB = result.scheduled_slots.filter(s => s.tenant_id === 'tenant_b').length;
        expect(slotsA).toBe(5);
        expect(slotsB).toBe(3);
    });

    test('2. Respects Strict Priority Mode Ordering', () => {
        const input = createBaseInput();
        input.scheduler_config.fairness_mode = 'STRICT_PRIORITY';
        input.tenant_context.tenant_b.priority = 100;
        input.tenant_context.tenant_a.priority = 1;
        const result = execute(input);
        expect(result.scheduled_slots[0].tenant_id).toBe('tenant_b');
        const slotsB = result.scheduled_slots.filter(s => s.tenant_id === 'tenant_b').length;
        expect(slotsB).toBe(3);
    });

    test('3. Respects Max Slices Per Request', () => {
        const input = createBaseInput();
        input.scheduler_config.max_slices_per_request = 2;
        const result = execute(input);
        const reqASlots = result.scheduled_slots.filter(s => s.agent_request_id === 'req_a1').length;
        expect(reqASlots).toBe(2);
        const unscheduledA = result.unscheduled_requests.find(u => u.agent_request_id === 'req_a1');
        expect(unscheduledA).toBeUndefined();
    });

    test('4. Enforces Rate Limits (Yields RATE_LIMIT_EXCEEDED)', () => {
        const input = createBaseInput();
        input.rate_limit_snapshot.tenant_a = { per_minute_used: 100, per_hour_used: 0 };
        const result = execute(input);
        const slotsA = result.scheduled_slots.filter(s => s.tenant_id === 'tenant_a').length;
        expect(slotsA).toBe(0);
        const unscheduledA = result.unscheduled_requests.find(u => u.agent_request_id === 'req_a1');
        expect(unscheduledA).toBeDefined();
        expect(unscheduledA.reason_code).toBe('RATE_LIMIT_EXCEEDED');
    });

    test('5. Respects Max Concurrent Agents', () => {
        const input = createBaseInput();
        input.tenant_context.tenant_a.max_concurrent_agents = 1;
        input.agent_queue.req_a2 = {
            tenant_id: 'tenant_a',
            agent_id: 'agent_a2',
            requested_at: '2025-12-06T20:00:00.000Z',
            priority: 5
        };
        const result = execute(input);
        const slots = result.scheduled_slots;
        const indices = slots.map(s => s.slot_index);
        expect(new Set(indices).size).toBe(indices.length);
    });

    test('6. Uses Prior Schedule State (Quota Reduction)', () => {
        const input = createBaseInput();
        input.prior_schedule_state.tenant_slices.tenant_a = 5;
        const result = execute(input);
        const slotsA = result.scheduled_slots.filter(s => s.tenant_id === 'tenant_a').length;
        expect(slotsA).toBe(1);
    });

    // --- TP1 New Mandatory Tests ---

    test('7. WRR Scans Tenant Queue (Req 1 Maxed, Req 2 Scheduled)', () => {
        const input = createBaseInput();
        input.agent_queue = {
            req_a1_maxed: {
                tenant_id: 'tenant_a',
                agent_id: 'agent_a1',
                requested_at: '2025-12-06T20:00:00.000Z',
                priority: 10
            },
            req_a2_fresh: {
                tenant_id: 'tenant_a',
                agent_id: 'agent_a2',
                requested_at: '2025-12-06T20:00:01.000Z',
                priority: 10
            }
        };
        input.prior_schedule_state.request_slices = { 'req_a1_maxed': 5 };
        input.scheduler_config.max_slices_per_request = 5;

        const result = execute(input);

        const u1 = result.unscheduled_requests.find(u => u.agent_request_id === 'req_a1_maxed');
        expect(u1).toBeDefined();
        expect(u1.reason_code).toBe('MAX_SLICES_PER_REQUEST_REACHED');

        const s2 = result.scheduled_slots.filter(s => s.agent_request_id === 'req_a2_fresh');
        expect(s2.length).toBeGreaterThan(0);
    });

    test('8. Env Off, Input Flag True -> FEATURE_DISABLED', () => {
        process.env.FF_AGENT_TIME_EXECUTION_SCHEDULER = 'false';
        const input = createBaseInput();
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
    });

    test('9. Env On, Input Flag False -> FEATURE_DISABLED', () => {
        process.env.FF_AGENT_TIME_EXECUTION_SCHEDULER = 'true';
        const input = createBaseInput();
        input.feature_flags.FF_AGENT_TIME_EXECUTION_SCHEDULER = false;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
    });

    test('10. Missing execution_id -> VALIDATION_FAILED', () => {
        const input = createBaseInput();
        delete input.execution_id;
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('INVALID_EXECUTION_ID');
    });

    test('11. Missing rate_limit_snapshot -> VALIDATION_FAILED', () => {
        const input = createBaseInput();
        delete input.rate_limit_snapshot;
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('MISSING_RATE_LIMIT_SNAPSHOT');
    });

    test('12. Total Slices Zero -> NO_SLOTS_AVAILABLE', () => {
        const input = createBaseInput();
        input.time_window.end_logical_time = 1050;
        input.time_window.slice_ms = 100;
        const result = execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('NO_SLOTS_AVAILABLE');
        expect(result.scheduled_slots).toEqual([]);
    });

    // --- Original Negative / Edge ---

    test('13. Invalid Phase', () => {
        const input = createBaseInput();
        input.phase = '70';
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('INVALID_PHASE');
    });

    test('14. Invalid Time Window (End < Start)', () => {
        const input = createBaseInput();
        input.time_window.end_logical_time = 900;
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('INVALID_TIME_WINDOW');
    });

    test('15. Unknown Tenant ID in Agent Queue', () => {
        const input = createBaseInput();
        input.agent_queue.req_bad = {
            tenant_id: 'tenant_ghost',
            agent_id: 'a',
            requested_at: '...'
        };
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('UNKNOWN_TENANT_ID');
    });

    test('16. Date Object Rejection', () => {
        const input = createBaseInput();
        input._debug = { date: new Date() };
        const result = execute(input);
        expect(result.status).toBe('VALIDATION_FAILED');
        expect(result.violations[0].code).toBe('NON_SERIALIZABLE_TYPE');
    });

    test('17. Empty Agent Queue', () => {
        const input = createBaseInput();
        input.agent_queue = {};
        const result = execute(input);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('NO_ELIGIBLE_AGENTS');
    });

    test('18. Zero Weight Tenant (NO_TENANT_WEIGHT)', () => {
        const input = createBaseInput();
        input.tenant_context.tenant_a.weight = 0;
        const result = execute(input);
        const un = result.unscheduled_requests.find(u => u.agent_request_id === 'req_a1');
        expect(un).toBeDefined();
        expect(un.reason_code).toBe('NO_TENANT_WEIGHT');
    });

    test('19. All Tenants Quota Zero', () => {
        const input = createBaseInput();
        input.tenant_context.tenant_a.max_slices_per_window = 0;
        input.tenant_context.tenant_b.max_slices_per_window = 0;
        const result = execute(input);
        expect(result.scheduled_slots.length).toBe(0);
        const un = result.unscheduled_requests.find(u => u.agent_request_id === 'req_a1');
        expect(un.reason_code).toBe('TENANT_QUOTA_EXHAUSTED');
    });

    test('20. Max Total Slices Clamp', () => {
        const input = createBaseInput();
        input.scheduler_config.max_total_slices = 5;
        const result = execute(input);
        expect(result.time_window.total_slices).toBe(5);
        expect(result.scheduled_slots.length).toBeLessThanOrEqual(5);
    });

    test('21. Determinism (Output Consistency & Input Immutability)', () => {
        const input = createBaseInput();
        const originalInputStr = JSON.stringify(input);
        const r1 = execute(input);
        const r2 = execute(input);
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        expect(JSON.stringify(input)).toBe(originalInputStr);
    });

    // --- TP1.1 Micro-Patch Test ---
    test('22. Reason Code: NO_SLOTS_AVAILABLE for unscheduled request', () => {
        const input = createBaseInput();
        // Setup: 1 Slot Total (1000-1100, slice 100)
        input.time_window.start_logical_time = 1000;
        input.time_window.end_logical_time = 1100;
        input.time_window.slice_ms = 100;

        // Important: Remove Tenant B to prevent quota dilution (1 slice * 2/3 < 1)
        delete input.tenant_context.tenant_b;

        // Setup: Tenant A with 2 requests
        input.agent_queue = {
            req_priority_high: {
                tenant_id: 'tenant_a',
                agent_id: 'agent_a1',
                requested_at: '2025-12-06T20:00:00.000Z',
                priority: 10
            },
            req_priority_low: {
                tenant_id: 'tenant_a',
                agent_id: 'agent_a2',
                requested_at: '2025-12-06T20:00:00.000Z',
                priority: 5 // Lower priority, will be unscheduled
            }
        };

        // Ensure quotas are sufficient
        input.tenant_context.tenant_a.max_slices_per_window = 10;
        input.scheduler_config.max_total_slices = 10;

        const result = execute(input);

        // Expect 1 scheduled slot (Total Slices = 1)
        expect(result.scheduled_slots.length).toBe(1);
        expect(result.scheduled_slots[0].agent_request_id).toBe('req_priority_high');

        // Expect low priority request to be unscheduled with NO_SLOTS_AVAILABLE
        const un = result.unscheduled_requests.find(u => u.agent_request_id === 'req_priority_low');
        expect(un).toBeDefined();
        // The default fallback in engine logic is NO_SLOTS_AVAILABLE
        expect(un.reason_code).toBe('NO_SLOTS_AVAILABLE');
    });

});
