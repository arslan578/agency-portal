const { execute } = require('../phase_66_connector_health_evolution_engine');

describe('Phase 66: Connector Health Evolution Engine (Canonical)', () => {

    // Canonical Base Input
    const BASE_INPUT = {
        execution_id: 'exec-123',
        phase: '66',
        feature_flags: { FF_CONNECTOR_HEALTH_EVOLUTION_ENGINE: true },
        connector_id: 'conn-abc',
        previous_profile: {
            health_score: 100.00,
            health_tier: 'HEALTHY',
            consecutive_perfect_runs: 0,
            high_integrity: false
        },
        execution_delta: {
            execution_result: 'SUCCESS',
            latency_ms: 100,
            budget_ms: 200,
            retries_used: 0,
            drift_markers: []
        },
        policy_context: {
            penalties: []
        }
    };

    const clone = (obj) => JSON.parse(JSON.stringify(obj));

    // 1. Baseline recovery 100→100
    test('1. Baseline recovery 100→100', () => {
        const input = clone(BASE_INPUT);
        const result = execute(input);
        expect(result.health_update.health_score).toBe(100.00);
        expect(result.health_update.health_tier).toBe('HEALTHY');
        // No base evolution trace since score didn't change
        expect(result.reasoning_trace.find(t => t.step === 'BASE_EVOLUTION')).toBeUndefined();
    });

    // 2. Standard recovery 90→91
    test('2. Standard recovery 90→91', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 90.00;
        const result = execute(input);
        expect(result.health_update.health_score).toBe(91.00);
        expect(result.health_update.evolution_vector).toBe('RECOVERING');
        expect(result.reasoning_trace[0]).toMatchObject({
            step: 'BASE_EVOLUTION',
            from: 90.00,
            to: 91.00,
            delta: 1.00,
            reason: 'SUCCESS_RECOVERY'
        });
    });

    // 3. Minor degradation (latency)
    test('3. Minor degradation (latency)', () => {
        const input = clone(BASE_INPUT);
        input.execution_delta.latency_ms = 300;
        input.execution_delta.budget_ms = 200;
        const result = execute(input);
        expect(result.health_update.health_score).toBe(99.00);
        expect(result.reasoning_trace[0]).toMatchObject({
            step: 'BASE_EVOLUTION',
            delta: -1.00,
            reason: 'LATENCY_VIOLATION'
        });
    });

    // 4. Major degradation (timeout)
    test('4. Major degradation (timeout)', () => {
        const input = clone(BASE_INPUT);
        input.execution_delta.execution_result = 'TIMEOUT';
        const result = execute(input);
        expect(result.health_update.health_score).toBe(90.00);
        expect(result.reasoning_trace[0]).toMatchObject({
            step: 'BASE_EVOLUTION',
            delta: -10.00,
            reason: 'TIMEOUT'
        });
    });

    // 5. Hard error (-15)
    test('5. Hard error (-15)', () => {
        const input = clone(BASE_INPUT);
        input.execution_delta.execution_result = 'HARD_ERROR';
        const result = execute(input);
        expect(result.health_update.health_score).toBe(85.00);
        expect(result.health_update.health_tier).toBe('WARNING'); // 75-89.99
    });

    // 6. Zero floor clamping
    test('6. Zero floor clamping', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 5.00;
        input.previous_profile.health_tier = 'CRITICAL';
        input.execution_delta.execution_result = 'TIMEOUT'; // -10 -> would be -5
        const result = execute(input);
        expect(result.health_update.health_score).toBe(0.00);
        expect(result.health_update.health_tier).toBe('DISABLED');
    });

    // 7. Tier change: HEALTHY→WARNING
    test('7. Tier change: HEALTHY→WARNING', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 90.00;
        input.execution_delta.latency_ms = 300;
        input.execution_delta.budget_ms = 200; // -1 -> 89.00
        const result = execute(input);
        expect(result.health_update.health_tier).toBe('WARNING');

        const mappingTrace = result.reasoning_trace.find(t => t.step === 'TIER_MAPPING');
        expect(mappingTrace).toMatchObject({
            from: 'HEALTHY',
            to: 'WARNING',
            delta: 0,
            reason: 'TIER:HEALTHY->WARNING'
        });
    });

    // 8. Tier change: DEGRADED→CRITICAL
    test('8. Tier change: DEGRADED→CRITICAL', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 50.00;
        input.previous_profile.health_tier = 'DEGRADED';
        input.execution_delta.latency_ms = 300;
        input.execution_delta.budget_ms = 200; // -1 -> 49.00
        const result = execute(input);
        expect(result.health_update.health_tier).toBe('CRITICAL');

        const mappingTrace = result.reasoning_trace.find(t => t.step === 'TIER_MAPPING');
        expect(mappingTrace).toMatchObject({
            from: 'DEGRADED',
            to: 'CRITICAL',
            delta: 0
        });
    });

    // 9. Penalty override → DISABLED
    test('9. Penalty override → DISABLED', () => {
        const input = clone(BASE_INPUT);
        input.policy_context.penalties = ['POLICY_VIOLATION_BLOCK'];
        const result = execute(input);
        // Score remains 100, Tier forced to DISABLED
        expect(result.health_update.health_score).toBe(100.00);
        expect(result.health_update.health_tier).toBe('DISABLED');
        expect(result.reasoning_trace.some(t => t.step === 'PENALTY_OVERRIDE')).toBe(true);
        // Ensure no BASE_EVOLUTION trace 
        expect(result.reasoning_trace.some(t => t.step === 'BASE_EVOLUTION')).toBe(false);
    });

    // 10. Penalty override → DEGRADED
    test('10. Penalty override → DEGRADED', () => {
        const input = clone(BASE_INPUT);
        input.policy_context.penalties = ['BUDGET_WARN'];
        const result = execute(input);
        expect(result.health_update.health_tier).toBe('DEGRADED');
    });

    // 11. Penalty removed → normal tier
    test('11. Penalty removed → normal tier', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 95.00;
        input.policy_context.penalties = [];
        // Normal calc: recovery +1 -> 96 -> HEALTHY
        const result = execute(input);
        expect(result.health_update.health_tier).toBe('HEALTHY');
        // Ensure no PENALTY_OVERRIDE trace
        expect(result.reasoning_trace.some(t => t.step === 'PENALTY_OVERRIDE')).toBe(false);
    });

    // 12. Drift severity adjustment
    test('12. Drift severity adjustment', () => {
        const input = clone(BASE_INPUT);
        input.execution_delta.drift_markers = [{ code: 'X', severity: 2 }];
        // Base stays 100. Drift: -10. Final 90.
        const result = execute(input);
        expect(result.health_update.health_score).toBe(90.00);
        expect(result.reasoning_trace.some(t => t.step === 'DRIFT_ADJUSTMENT')).toBe(true);
    });

    // 13. Timeout + drift chain
    test('13. Timeout + drift chain', () => {
        const input = clone(BASE_INPUT);
        input.execution_delta.execution_result = 'TIMEOUT'; // -10 -> 90
        input.execution_delta.drift_markers = [{ code: 'X', severity: 1 }]; // -5 -> 85
        const result = execute(input);
        expect(result.health_update.health_score).toBe(85.00);
        // Verify order
        const steps = result.reasoning_trace;
        expect(steps[0].step).toBe('BASE_EVOLUTION');
        expect(steps[1].step).toBe('DRIFT_ADJUSTMENT');
    });

    // 14. Float precision rounding
    test('14. Float precision rounding', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.health_score = 90.11111;
        const result = execute(input);
        expect(result.health_update.health_score).toBe(91.11);
    });

    // 15. Determinism
    test('15. Determinism (three runs identical)', () => {
        const input = clone(BASE_INPUT);
        const r1 = execute(input);
        const r2 = execute(input);
        const r3 = execute(input);
        expect(r1).toEqual(r2);
        expect(r2).toEqual(r3);
    });

    // 16. Integrity promotion 9→10
    test('16. Integrity promotion 9→10', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.consecutive_perfect_runs = 9;
        const result = execute(input);
        expect(result.health_update.consecutive_perfect_runs).toBe(10);
        expect(result.health_update.high_integrity).toBe(true);
        expect(result.reasoning_trace.some(t => t.step === 'INTEGRITY_CHECK')).toBe(true);
    });

    // 17. Integrity reset on failure
    test('17. Integrity reset on failure', () => {
        const input = clone(BASE_INPUT);
        input.previous_profile.consecutive_perfect_runs = 10;
        input.previous_profile.high_integrity = true;
        input.execution_delta.execution_result = 'SOFT_ERROR';
        const result = execute(input);
        expect(result.health_update.consecutive_perfect_runs).toBe(0);
        expect(result.health_update.high_integrity).toBe(false);
        expect(result.reasoning_trace.find(t => t.step === 'INTEGRITY_CHECK').reason).toBe('NO_HIGH_INTEGRITY');
    });

    // 18. Invalid inputs rejected deterministically
    test('18. Invalid inputs rejected deterministically', () => {
        expect(execute(null).ok).toBe(false);
        const bad = clone(BASE_INPUT);
        bad.previous_profile.health_score = -1;
        expect(execute(bad).status).toBe('INVALID_INPUT');
    });

});
