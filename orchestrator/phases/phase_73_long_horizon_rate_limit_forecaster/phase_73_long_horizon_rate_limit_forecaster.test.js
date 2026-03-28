const { output_contract } = require('./phase_73_long_horizon_rate_limit_forecaster');
const crypto = require('crypto');

// Mocks for observability
jest.mock('../../shared/logging', () => ({
    logStructured: jest.fn()
}));
jest.mock('../../shared/metrics', () => ({
    count: jest.fn(),
    gauge: jest.fn()
}));
jest.mock('../../shared/tracing', () => ({
    startSpan: jest.fn(() => ({ end: jest.fn() }))
}));

describe('Phase 73: Long-Horizon Rate Limit Forecaster (TP1)', () => {

    const baseInput = {
        execution_id: 'exec-123',
        phase: '73',
        feature_flags: { FF_LONG_HORIZON_RATE_LIMIT_FORECASTER: true },
        arbitration_output: { rate_limit_offsets: {} },
        rate_limit_ledger: {
            'conn-1': [
                { window_start: 1000, window_end: 2000, usage: 10 },
                { window_start: 2000, window_end: 3000, usage: 20 },
                { window_start: 3000, window_end: 4000, usage: 30 },
            ]
        },
        connector_profiles: {
            'conn-1': { max_rate_per_window: 100, window_size_ms: 1000 }
        },
        tenant_context: {
            'tenant-A': { hard_cap_usage: 500 }
        },
        agent_context: {
            'agent-X': { priority: 1 }
        },
        knowledge_maps: {
            rate_limits: {
                risk_thresholds: { low: 0.0, medium: 0.5, high: 0.75, critical: 0.9 },
                decay_curves: { default: 1.0 },
                forecast_horizon: 5,
                future_window_decay_base: 0.9,
                confidence_decay_base: 0.8,
                agent_default_ceiling: 999
            }
        }
    };

    // ------------------------------------------------------------------
    // Happy Path (6)
    // ------------------------------------------------------------------

    test('HP1: Steady Usage Forecast with Configured Horizon', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_connector_ceiling['conn-1']).toBeCloseTo(100 - 23, 1);
        expect(output.rate_limit_forecast.future_windows.length).toBe(5);
        expect(output.rate_limit_forecast.projected_agent_ceiling['agent-X']).toBe(999);
    });

    test('HP2: Rising Consumption Risk', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.rate_limit_ledger['conn-1'] = [
            { window_start: 1, window_end: 2, usage: 80 },
            { window_start: 2, window_end: 3, usage: 90 },
            { window_start: 3, window_end: 4, usage: 95 }
        ];
        const output = output_contract(input);
        expect(output.rate_limit_forecast.risk_classification).toBe('CRITICAL');
    });

    test('HP3: Falling Consumption', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.rate_limit_ledger['conn-1'] = [
            { window_start: 1, window_end: 2, usage: 100 },
            { window_start: 2, window_end: 3, usage: 50 },
            { window_start: 3, window_end: 4, usage: 10 }
        ];
        // 10*0.5 + 50*0.3 + 100*0.2 = 5 + 15 + 20 = 40
        const output = output_contract(input);
        expect(output.rate_limit_forecast.risk_classification).toBe('LOW'); // 40/100 = 0.4 < 0.5
    });

    test('HP4: Multiple Connectors Mixed', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.connector_profiles['conn-2'] = { max_rate_per_window: 50, window_size_ms: 1000 };
        input.rate_limit_ledger['conn-2'] = [
            { window_start: 1, usage: 40 },
            { window_start: 2, usage: 45 },
            { window_start: 3, usage: 48 }
        ];
        const output = output_contract(input);
        expect(output.rate_limit_forecast.risk_classification).toBe('CRITICAL');
        expect(Object.keys(output.rate_limit_forecast.projected_connector_ceiling)).toContain('conn-2');
    });

    test('HP5: Arbitration Adjustment (Explicit Offset)', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.arbitration_output = {
            rate_limit_offsets: {
                connector: { 'conn-1': 10 } // Adds 10 to capacity (frees up) or adds 10 to consumption? 
                // Logic: ceiling = base - projected + offset. 
                // So positive offset INCREASES ceiling.
            }
        };
        // Base 100 - Projected 23 + Offset 10 = 87
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_connector_ceiling['conn-1']).toBe(87);
    });

    test('HP6: Horizon Validation (Dynamic)', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.knowledge_maps.rate_limits.forecast_horizon = 2;
        const output = output_contract(input);
        expect(output.rate_limit_forecast.future_windows.length).toBe(2);
    });

    // ------------------------------------------------------------------
    // Negative Path (6)
    // ------------------------------------------------------------------

    test('NP1: Missing Required Fields (Forecast Horizon)', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        delete input.knowledge_maps.rate_limits.forecast_horizon;
        expect(() => output_contract(input)).toThrow('Phase 73: Missing knowledge_maps.rate_limits.forecast_horizon');
    });

    test('NP2: Missing Agent Ceiling', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        delete input.knowledge_maps.rate_limits.agent_default_ceiling;
        expect(() => output_contract(input)).toThrow('Phase 73: Missing knowledge_maps.rate_limits.agent_default_ceiling');
    });

    test('NP3: Forbidden Function Type', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.rate_limit_ledger['conn-1'][0].usage = () => { };
        expect(() => output_contract(input)).toThrow('Phase 73: Forbidden type "function" at path "root.rate_limit_ledger.conn-1[0].usage"');
    });

    test('NP4: Forbidden _debug Field', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.connector_profiles['conn-1']._debug = "test";
        expect(() => output_contract(input)).toThrow('Phase 73: Forbidden _debug field at path "root.connector_profiles.conn-1._debug"');
    });

    test('NP5: Arithmetic Safety (Negative Ceiling)', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.rate_limit_ledger['conn-1'] = [{ window_start: 1, usage: 200 }]; // 200 usage vs 100 limit
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_connector_ceiling['conn-1']).toBe(0);
    });

    test('NP6: Feature Flag Disabled', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.feature_flags.FF_LONG_HORIZON_RATE_LIMIT_FORECASTER = false;
        const output = output_contract(input);
        expect(output.rate_limit_forecast.future_windows).toEqual([]);
        expect(output.rate_limit_forecast.risk_classification).toBe('LOW');
    });

    // ------------------------------------------------------------------
    // Edge Cases (4)
    // ------------------------------------------------------------------

    test('EC1: Tenant Connector Map', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.tenant_connector_map = {
            'tenant-A': ['conn-1']
        };
        // conn-1 forecast is 23. Tenant Cap 500. Result 477.
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_tenant_ceiling['tenant-A']).toBe(477);
    });

    test('EC2: Tenant Connector Map Missing', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        delete input.tenant_connector_map;
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_tenant_ceiling['tenant-A']).toBe(500);
    });

    test('EC3: Zero Historical Usage', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.rate_limit_ledger['conn-1'] = [];
        const output = output_contract(input);
        expect(output.rate_limit_forecast.projected_connector_ceiling['conn-1']).toBe(100);
        expect(output.rate_limit_forecast.risk_classification).toBe('LOW');
    });

    test('EC4: Multi-Agent Symmetrical Usage (Conflict Placeholder)', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        input.agent_context['agent-Y'] = { priority: 2 };
        const output = output_contract(input);
        expect(Object.keys(output.rate_limit_forecast.projected_agent_ceiling)).toContain('agent-X');
        expect(Object.keys(output.rate_limit_forecast.projected_agent_ceiling)).toContain('agent-Y');
    });

    // ------------------------------------------------------------------
    // Regression & Determinism (2)
    // ------------------------------------------------------------------

    test('REG1: 100 Iterations Stability', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        const first = JSON.stringify(output_contract(input));
        for (let i = 0; i < 100; i++) {
            const current = JSON.stringify(output_contract(input));
            expect(current).toBe(first);
        }
    });

    test('DET1: Deterministic Output Hash', () => {
        const input = JSON.parse(JSON.stringify(baseInput));
        const output = output_contract(input);
        const hash = crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex');
        const output2 = output_contract(input);
        const hash2 = crypto.createHash('sha256').update(JSON.stringify(output2)).digest('hex');
        expect(hash).toBe(hash2);
    });

});
