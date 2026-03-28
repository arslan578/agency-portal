const { execute } = require('../phase_69_policy_gradient_adjustment_engine');

// Mock Observability
jest.mock('../../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../../shared/metrics', () => ({
    increment: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

const logging = require('../../../shared/logging');
const metrics = require('../../../shared/metrics');
const tracing = require('../../../shared/tracing');

describe('Phase 69: Policy Gradient Adjustment Engine (Tightened)', () => {

    const BASE_INPUT = {
        execution_id: 'exec-69-test',
        phase: '69',
        feature_flags: { FF_POLICY_GRADIENT_ADJUSTMENT: true },
        safety_horizon: { risk_score: 0 },
        policy_coefficients: {
            risk_penalty_weight: 1.0,
            violation_penalty_weight: 1.0,
            connector_drift_weight: 1.0
        },
        violation_history: { recent_violations: [] },
        drift_indicators: { total_drift: 0 }
    };

    const STANDARD_PROFILE = {
        risk_to_weight: 0.05,
        drift_to_weight: 0.05,
        violation_to_weight: 0.1
    };

    const clone = (obj) => JSON.parse(JSON.stringify(obj));

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Happy Paths (6 Tests) ---

    test('1. Positive Risk Gradient -> Increases risk_penalty_weight', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE; // Inject Profile
        input.safety_horizon.risk_score = 2.0; // Gradient: 2 * 0.05 = 0.1
        const result = execute(input);
        expect(result.ok).toBe(true);
        expect(result.gradient_applied.risk_penalty_weight).toBe(0.1);
        expect(result.policy_coefficients_updated.risk_penalty_weight).toBe(1.1);
    });

    test('2. Drift Gradient -> Increases connector_drift_weight', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE; // Inject
        input.drift_indicators.total_drift = 2.0; // Gradient: 2 * 0.05 = 0.1
        const result = execute(input);
        expect(result.gradient_applied.connector_drift_weight).toBe(0.1);
        expect(result.policy_coefficients_updated.connector_drift_weight).toBe(1.1);
    });

    test('3. Mixed Signals -> Multiple Updates', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE; // Inject
        input.safety_horizon.risk_score = 1.0; // +0.05
        input.violation_history.recent_violations = [{ type: 'foo' }]; // +0.1
        const result = execute(input);
        expect(result.gradient_applied.risk_penalty_weight).toBe(0.05);
        expect(result.gradient_applied.violation_penalty_weight).toBe(0.1);
    });

    test('4. All Deltas within Bounds (Standard)', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE; // Inject
        input.safety_horizon.risk_score = 1.0;
        const result = execute(input);
        expect(result.clamp_events).toHaveLength(0);
    });

    test('5. Neutral Inputs -> Zero Gradient', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE; // Even with profile, 0 signal = 0 result
        const result = execute(input);
        expect(Object.keys(result.gradient_applied)).toHaveLength(0);
        expect(metrics.increment).toHaveBeenCalledWith('phase_69_noop');
    });

    test('6. Deterministic Output (Repeated Runs)', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = 1.0;
        const json1 = JSON.stringify(execute(input));
        const json2 = JSON.stringify(execute(input));
        expect(json1).toBe(json2);
    });

    // --- Negative Paths (6 Tests) ---

    test('7. Feature Flag Off -> FEATURE_DISABLED', () => {
        const input = clone(BASE_INPUT);
        input.feature_flags.FF_POLICY_GRADIENT_ADJUSTMENT = false;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.status).toBe('FEATURE_DISABLED');
    });

    test('8. Missing Required Field -> Error', () => {
        const input = clone(BASE_INPUT);
        delete input.safety_horizon;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/Missing required field/);
    });

    test('9. Out-of-range Delta -> Clamped to 0.2', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = 100.0; // 100 * 0.05 = 5.0 (Huge)
        const result = execute(input);
        expect(result.gradient_applied.risk_penalty_weight).toBe(0.2); // Clamped
        expect(result.clamp_events).toContain('risk_penalty_weight');
        expect(metrics.increment).toHaveBeenCalledWith('phase_69_clamp_event');
    });

    test('10. Forbidden Type (Undefined) -> Error', () => {
        const input = clone(BASE_INPUT);
        input.policy_coefficients.bad_val = undefined;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/Input contains forbidden types/);
    });

    test('11. Unknown Top-Level Field -> Error', () => {
        const input = clone(BASE_INPUT);
        input.extra_junk = true;
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/Unknown top-level field/);
    });

    test('12. Invalid Phase ID -> Error', () => {
        const input = clone(BASE_INPUT);
        input.phase = '68';
        const result = execute(input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/Invalid phase/);
    });

    // --- Edge Cases (4 Tests + New Checks) ---

    test('13. All Clamped Scenario', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = 100; // +5.0 -> +0.2
        input.drift_indicators.total_drift = 100; // +5.0 -> +0.2
        const result = execute(input);
        expect(result.gradient_applied.risk_penalty_weight).toBe(0.2);
        expect(result.gradient_applied.connector_drift_weight).toBe(0.2);
        expect(result.clamp_events).toHaveLength(2);
    });

    test('14. High Violations, Zero Drift', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.violation_history.recent_violations = new Array(5).fill({ t: 'x' }); // +0.5 -> +0.2 Clamped
        const result = execute(input);
        expect(result.gradient_applied.violation_penalty_weight).toBe(0.2);
        expect(result.gradient_applied.connector_drift_weight).toBeUndefined();
    });

    test('15. Negative Clamping (Reversibility)', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = -10.0; // -0.5 -> -0.2
        const result = execute(input);
        expect(result.gradient_applied.risk_penalty_weight).toBe(-0.2);
    });

    test('16. Empty Violation History', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.violation_history = {}; // Valid object, no array
        const result = execute(input);
        expect(result.ok).toBe(true);
        expect(result.gradient_applied.violation_penalty_weight).toBeUndefined();
    });

    // --- Tightening Patch Tests ---

    test('19. Neutral Profile -> Zero Gradients (Even with Signals)', () => {
        const input = clone(BASE_INPUT);
        // NO policy_gradient_profile (defaults to 0)
        input.safety_horizon.risk_score = 10.0;
        input.drift_indicators.total_drift = 10.0;

        const result = execute(input);
        expect(Object.keys(result.gradient_applied)).toHaveLength(0); // Should be empty
    });

    test('20. Explicit Signal Summation (Drift & Violations)', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;

        // Drift: total (2) + severity (3) = 5
        input.drift_indicators = { total_drift: 2, severity_score: 3 };
        // 5 * 0.05 = 0.25 -> clamped 0.2

        // Violation: array (2) + nested (2) = 4
        // Note: Engine sums IF structure permits. 
        // Our test input structure needs to be tricky?
        // JS allows array to have properties.
        const vArray = ['a', 'b'];
        vArray.recent_violations = ['c', 'd'];
        input.violation_history = vArray;

        const result = execute(input);

        // Verify Drift Sum
        // 5 * 0.05 = 0.25 -> clamped 0.2
        expect(result.gradient_applied.connector_drift_weight).toBe(0.2);

        // Verify Violation Sum
        // 4 * 0.1 = 0.4 -> clamped 0.2
        expect(result.gradient_applied.violation_penalty_weight).toBe(0.2);
    });

    // --- Guards (2 Tests) ---

    test('17. Regression Guard: Sorted Output Keys', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = 1.0;
        const result = execute(input);
        const keys = Object.keys(result.policy_coefficients_updated);
        const sortedKeys = [...keys].sort();
        expect(JSON.stringify(keys)).toBe(JSON.stringify(sortedKeys));
    });

    test('18. Determinism Loop (50 Runs)', () => {
        const input = clone(BASE_INPUT);
        input.policy_gradient_profile = STANDARD_PROFILE;
        input.safety_horizon.risk_score = 2.0;
        const r1 = JSON.stringify(execute(input));
        for (let i = 0; i < 49; i++) {
            expect(JSON.stringify(execute(input))).toBe(r1);
        }
    });

});
