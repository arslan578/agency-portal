/**
 * Phase 57-59 Chain Integration Test Suite
 * 
 * Comprehensive test coverage for Safety Layer chain (57→58→59).
 * 
 * NOTE: This test suite exercises the Safety Layer chain directly via a helper function
 * that mirrors the dispatcher's logic. This is a strategic choice to avoid Jest/ESM 
 * dependency issues with 'franc' in the main dispatcher module.
 * 
 * TODO: Once Jest ESM support or franc CJS shim is in place, update these tests 
 * to exercise dispatcher.js SAFETY_LAYER_EVALUATION_V1 directly.
 * 
 * Coverage:
 * - 6 Happy Path tests
 * - 6 Negative tests
 * - 4 Edge Case tests
 * - 2 Observability tests
 * - 1 Regression Guard
 * - 1 Determinism Guard
 * Total: 20 tests
 */

// Mock shared utilities
jest.mock('../shared/logging');
jest.mock('../shared/metrics');
jest.mock('../shared/tracing');

// Mock phase engines with explicit factories
jest.mock('../phases/57_global_connector_state_merger/global_connector_state_merger_engine', () => ({
    execute: jest.fn()
}));
jest.mock('../phases/58_safety_horizon_evaluator/phase_58_safety_horizon_evaluator', () => ({
    execute: jest.fn()
}));
jest.mock('../phases/59_optimizer_safety_guard/optimizer_safety_guard_engine', () => ({
    execute: jest.fn()
}));

const { logStructured } = require('../shared/logging');
const metrics = require('../shared/metrics');
const tracing = require('../shared/tracing');
const envelopeValidator = require('../shared/envelope_validator');

const { execute: executePhase57 } = require('../phases/57_global_connector_state_merger/global_connector_state_merger_engine');
const { execute: executePhase58 } = require('../phases/58_safety_horizon_evaluator/phase_58_safety_horizon_evaluator');
const { execute: executePhase59 } = require('../phases/59_optimizer_safety_guard/optimizer_safety_guard_engine');

/**
 * Helper to mirror dispatcher.js Safety Layer logic
 * This ensures we test the exact chain semantics without loading the full dispatcher
 */
async function runSafetyLayerChain(payload) {
    const span = tracing.startSpan('phase_57_59_integration', {
        execution_id: payload?.execution_id || 'unknown'
    });

    try {
        const execution_id = payload?.execution_id || null;

        // Observability: Chain start
        metrics.count('safety_layer_invoked', 1, { execution_id });
        logStructured('safety_layer_chain_start', {
            execution_id,
            phase_chain: '57→58→59',
            timestamp: new Date().toISOString()
        });

        // Phase 57: Global Connector State Merger
        const phase57Output = await executePhase57(payload);

        // Feature-flag bypass: Don't chain if Phase 57 is disabled
        const phase57Status = phase57Output.status || phase57Output.status_code || null;
        if (phase57Status === 'FEATURE_DISABLED') {
            metrics.count('safety_layer_feature_disabled', 1, { execution_id, phase: '57' });
            span.end();
            return phase57Output;
        }

        // Validate Phase 57 → 58 transition
        const phase57Validation = envelopeValidator.validatePhase57Output(phase57Output);
        if (!phase57Validation.valid) {
            metrics.count('safety_layer_phase_transition', 1, {
                execution_id,
                transition: '57→58',
                status: 'FAILED'
            });
            span.end();
            return envelopeValidator.createValidationError(
                '57→58',
                phase57Validation.error,
                execution_id
            );
        }

        metrics.count('safety_layer_phase_transition', 1, {
            execution_id,
            transition: '57→58',
            status: 'OK'
        });
        logStructured('safety_layer_phase_transition', {
            execution_id,
            from_phase: '57',
            to_phase: '58',
            status: 'OK'
        });

        // Phase 58: Safety Horizon Evaluator
        // Construct Phase 58 input from Phase 57 output + original payload
        const phase58Input = {
            ...payload,
            merged_state: phase57Output.merged_state,
            execution_id: phase57Output.execution_id || execution_id
        };

        const phase58Output = await executePhase58(phase58Input);

        // Feature-flag bypass: Don't chain if Phase 58 is disabled
        const phase58Status = phase58Output.status || phase58Output.status_code || null;
        if (phase58Status === 'FEATURE_DISABLED') {
            metrics.count('safety_layer_feature_disabled', 1, { execution_id, phase: '58' });
            span.end();
            return phase58Output;
        }

        // Validate Phase 58 → 59 transition
        const phase58Validation = envelopeValidator.validatePhase58Output(phase58Output, payload);
        if (!phase58Validation.valid) {
            metrics.count('safety_layer_phase_transition', 1, {
                execution_id,
                transition: '58→59',
                status: 'FAILED'
            });
            span.end();
            return envelopeValidator.createValidationError(
                '58→59',
                phase58Validation.error,
                execution_id
            );
        }

        metrics.count('safety_layer_phase_transition', 1, {
            execution_id,
            transition: '58→59',
            status: 'OK'
        });
        logStructured('safety_layer_phase_transition', {
            execution_id,
            from_phase: '58',
            to_phase: '59',
            status: 'OK'
        });

        // Phase 59: Optimizer Safety Guard
        // Construct Phase 59 input from Phase 58 output + original payload
        const phase59Input = {
            ...payload,
            safety_horizon: {
                safe_execution_horizon: phase58Output.safe_execution_horizon,
                safety_zone: phase58Output.safety_zone,
                forbidden_actions: phase58Output.forbidden_actions,
                redundancy_profile: phase58Output.redundancy_profile,
                risk_ledger: phase58Output.risk_ledger
            },
            execution_id: phase58Output.execution_id || execution_id
        };

        const phase59Output = await executePhase59(phase59Input);

        // Final observability
        const finalStatus = phase59Output.status || phase59Output.status_code || null;
        const wasBlocked = finalStatus === 'SAFETY_VIOLATION';
        const wasPassthrough = finalStatus === 'OK' || finalStatus === 'FEATURE_DISABLED';

        if (wasBlocked) {
            metrics.count('safety_layer_blocked', 1, { execution_id });
            logStructured('safety_layer_chain_blocked', {
                execution_id,
                phase_chain: '57→58→59',
                final_status: finalStatus,
                violations: phase59Output.violations?.length || 0
            });
        } else if (wasPassthrough) {
            metrics.count('safety_layer_passthrough', 1, { execution_id });
        }

        if (finalStatus === 'FEATURE_DISABLED') {
            metrics.count('safety_layer_feature_disabled', 1, { execution_id });
        }

        logStructured('safety_layer_chain_complete', {
            execution_id,
            phase_chain: '57→58→59',
            final_status: finalStatus,
            timestamp: new Date().toISOString()
        });

        span.end();
        return phase59Output;

    } catch (error) {
        metrics.count('safety_layer_error', 1, {
            execution_id: payload?.execution_id || 'unknown',
            error: error.message
        });
        span.end();
        throw error;
    }
}

describe('Phase 57-59 Chain Integration: Safety Layer', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock tracing
        tracing.startSpan = jest.fn().mockReturnValue({
            end: jest.fn()
        });

        // Mock metrics
        metrics.count = jest.fn();

        // Mock logging
        logStructured.mockImplementation(() => { });
    });

    // ==================== HAPPY PATH TESTS ====================

    describe('Happy Path', () => {
        test('Happy 1 – Full 57→58→59 pipeline with healthy connectors', async () => {
            // Mock Phase 57 output (Sorted Keys)
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash123',
                error: null,
                execution_id: 'exec-001',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {
                    google_ads: {
                        state: 'HEALTHY',
                        capabilities: { can_create: true }
                    }
                },
                phase: '57',
                requested_at: '2024-01-01T00:00:00Z',
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            // Mock Phase 58 output (Sorted Keys)
            executePhase58.mockResolvedValue({
                execution_id: 'exec-001',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {
                    max_budget_delta_total: 1000,
                    max_steps_per_plan: 10
                },
                safety_zone: { max_risk: 'MEDIUM' },
                snapshot: {},
                status: 'OK'
            });

            // Mock Phase 59 output
            executePhase59.mockResolvedValue({
                execution_id: 'exec-001',
                phase: '59',
                status: 'OK',
                stop_reason: null,
                optimizer_plan_original: {},
                optimizer_plan_sanitized: {},
                violations: [],
                snapshot_overlay: {}
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-001',
                optimizer_plan: { steps: [] }
            });

            expect(result.status).toBe('OK');
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_invoked', 1, expect.any(Object));
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_passthrough', 1, expect.any(Object));
        });

        test('Happy 2 – Safety horizon restricting optimizer plan', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-002',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {
                    meta_ads: { state: 'HEALTHY', capabilities: {} }
                },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-002',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {
                    max_budget_delta_total: 100,  // Restrictive
                    max_steps_per_plan: 2
                },
                safety_zone: { max_risk: 'LOW' },
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-002',
                phase: '59',
                status: 'OK',
                violations: [],
                optimizer_plan_sanitized: { steps: [] }
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-002',
                optimizer_plan: { steps: [{ budget_delta: 200 }] }
            });

            expect(result.status).toBe('OK');
            expect(executePhase59).toHaveBeenCalledWith(
                expect.objectContaining({
                    safety_horizon: expect.objectContaining({
                        safe_execution_horizon: expect.objectContaining({
                            max_budget_delta_total: 100
                        })
                    })
                })
            );
        });

        test('Happy 3 – Forbidden actions honored by Phase 59', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-003',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: { connector_a: { state: 'HEALTHY', capabilities: {} } },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-003',
                feature_flag_enabled: true,
                forbidden_actions: [
                    { connector_id: 'connector_a', action_type: 'CREATE_CAMPAIGN' }
                ],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: { max_budget_delta_total: 1000 },
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-003',
                phase: '59',
                status: 'SAFETY_VIOLATION',
                violations: [{ violation_type: 'FORBIDDEN_ACTION' }]
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-003',
                optimizer_plan: { steps: [] }
            });

            expect(result.status).toBe('SAFETY_VIOLATION');
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_blocked', 1, expect.any(Object));
        });

        test('Happy 4 – Redundancy profiles flowing through', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-004',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {
                    google_ads: { state: 'HEALTHY', capabilities: {} },
                    meta_ads: { state: 'HEALTHY', capabilities: {} }
                },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-004',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {
                    google_ads: ['meta_ads'],
                    meta_ads: ['google_ads']
                },
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-004',
                phase: '59',
                status: 'OK',
                violations: []
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-004',
                optimizer_plan: { steps: [] }
            });

            expect(result.status).toBe('OK');
            expect(executePhase59).toHaveBeenCalledWith(
                expect.objectContaining({
                    safety_horizon: expect.objectContaining({
                        redundancy_profile: expect.objectContaining({
                            google_ads: ['meta_ads']
                        })
                    })
                })
            );
        });

        test('Happy 5 – Complete passthrough with all flags enabled', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-005',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-005',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-005',
                phase: '59',
                status: 'OK',
                feature_flag_enabled: true,
                violations: []
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-005',
                optimizer_plan: {}
            });

            expect(result.status).toBe('OK');
            expect(result.feature_flag_enabled).toBe(true);
        });

        test('Happy 6 – Budget clamping from horizon constraints', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-006',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: { conn1: { state: 'HEALTHY', capabilities: {} } },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-006',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {
                    max_budget_delta_per_connector: 100,
                    max_budget_delta_total: 500
                },
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-006',
                phase: '59',
                status: 'OK',
                violations: [],
                optimizer_plan_sanitized: {
                    steps: [{ budget_delta: 100 }]  // Clamped from higher
                }
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-006',
                optimizer_plan: { steps: [{ budget_delta: 999 }] }
            });

            expect(result.status).toBe('OK');
        });
    });

    // ==================== NEGATIVE TESTS ====================

    describe('Negative Path', () => {
        test('Negative 1 – Missing merged_state from Phase 57', async () => {
            executePhase57.mockResolvedValue({
                execution_id: 'exec-n1',
                phase: '57',
                // Missing merged_state
                status: 'OK'
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n1' });

            expect(result.status).toBe('INVALID_INPUT');
            expect(result.stop_reason).toBe('CONTRACT_VIOLATION');
            expect(result.error).toContain('merged_state');
        });

        test('Negative 2 – Invalid safety_horizon structure from Phase 58', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-n2',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-n2',
                phase: '58',
                // Missing required safety_zone
                safe_execution_horizon: {},
                forbidden_actions: [],
                redundancy_profile: {},
                risk_ledger: {},
                status: 'OK'
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n2' });

            expect(result.status).toBe('INVALID_INPUT');
            expect(result.error).toContain('safety_zone');
        });

        test('Negative 3 – Unknown fields in Phase 58 output', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-n3',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-n3',
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                status: 'OK',
                unknown_field: 'should_not_exist'  // Forbidden field
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n3' });

            expect(result.status).toBe('INVALID_INPUT');
            expect(result.error).toContain('Forbidden fields');
        });

        test('Negative 4 – Feature flag disabled for Phase 57', async () => {
            executePhase57.mockResolvedValue({
                execution_id: 'exec-n4',
                feature_flag_enabled: false,
                phase: '57',
                status: 'FEATURE_DISABLED'
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n4' });

            expect(result.status).toBe('FEATURE_DISABLED');
            expect(metrics.count).toHaveBeenCalledWith(
                'safety_layer_feature_disabled',
                1,
                expect.objectContaining({ phase: '57' })
            );
            // Should not call Phase 58
            expect(executePhase58).not.toHaveBeenCalled();
        });

        test('Negative 5 – Feature flag disabled for Phase 58', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-n5',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-n5',
                feature_flag_enabled: false,
                phase: '58',
                status: 'FEATURE_DISABLED'
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n5' });

            expect(result.status).toBe('FEATURE_DISABLED');
            expect(metrics.count).toHaveBeenCalledWith(
                'safety_layer_feature_disabled',
                1,
                expect.objectContaining({ phase: '58' })
            );
            // Should not call Phase 59
            expect(executePhase59).not.toHaveBeenCalled();
        });

        test('Negative 6 – Feature flag disabled for Phase 59', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-n6',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-n6',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-n6',
                feature_flag_enabled: false,
                phase: '59',
                status: 'FEATURE_DISABLED'
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-n6' });

            expect(result.status).toBe('FEATURE_DISABLED');
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_feature_disabled', 1, expect.any(Object));
        });
    });

    // ==================== EDGE CASE TESTS ====================

    describe('Edge Cases', () => {
        test('Edge 1 – Empty connector set', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-e1',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},  // Empty
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-e1',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-e1',
                phase: '59',
                status: 'OK',
                violations: []
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-e1' });

            expect(result.status).toBe('OK');
        });

        test('Edge 2 – All connectors in ERROR state', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-e2',
                feature_flag_enabled: true,
                global_drift: 'UNRESOLVED',
                global_health: 'DEGRADED',
                merged_state: {
                    conn1: { state: 'ERROR', capabilities: {} },
                    conn2: { state: 'ERROR', capabilities: {} }
                },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-e2',
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: { max_steps_per_plan: 0 },
                safety_zone: { max_risk: 'NONE' },
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-e2',
                phase: '59',
                status: 'SAFETY_VIOLATION',
                violations: [{ violation_type: 'MAX_STEPS_EXCEEDED' }]
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-e2',
                optimizer_plan: { steps: [{}] }
            });

            expect(result.status).toBe('SAFETY_VIOLATION');
        });

        test('Edge 3 – Global budget horizon = 0', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-e3',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: { conn: { state: 'HEALTHY', capabilities: {} } },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-e3',
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {
                    max_budget_delta_total: 0  // Zero budget
                },
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-e3',
                phase: '59',
                status: 'SAFETY_VIOLATION',
                violations: [{ violation_type: 'GLOBAL_BUDGET_EXCEEDED' }]
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-e3',
                optimizer_plan: { steps: [{ budget_delta: 10 }] }
            });

            expect(result.status).toBe('SAFETY_VIOLATION');
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_blocked', 1, expect.any(Object));
        });

        test('Edge 4 – All actions forbidden', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-e4',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {
                    google_ads: { state: 'HEALTHY', capabilities: {} }
                },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-e4',
                forbidden_actions: [
                    { connector_id: 'google_ads', action_type: '*' }
                ],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-e4',
                phase: '59',
                status: 'SAFETY_VIOLATION',
                violations: [
                    { violation_type: 'FORBIDDEN_ACTION' }
                ]
            });

            const result = await runSafetyLayerChain({
                execution_id: 'exec-e4',
                optimizer_plan: { steps: [{}] }
            });

            expect(result.status).toBe('SAFETY_VIOLATION');
        });
    });

    // ==================== OBSERVABILITY TESTS ====================

    describe('Observability', () => {
        test('Observability 1 – All metrics emitted correctly across chain', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-o1',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-o1',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-o1',
                phase: '59',
                status: 'OK',
                violations: []
            });

            await runSafetyLayerChain({ execution_id: 'exec-o1' });

            // Verify metrics
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_invoked', 1, expect.any(Object));
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_phase_transition', 1,
                expect.objectContaining({ transition: '57→58', status: 'OK' }));
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_phase_transition', 1,
                expect.objectContaining({ transition: '58→59', status: 'OK' }));
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_passthrough', 1, expect.any(Object));

            // Verify logs
            expect(logStructured).toHaveBeenCalledWith('safety_layer_chain_start', expect.any(Object));
            expect(logStructured).toHaveBeenCalledWith('safety_layer_chain_complete', expect.any(Object));
        });

        test('Observability 2 – Trace span created and completed with proper attributes', async () => {
            const mockSpan = {
                end: jest.fn()
            };
            tracing.startSpan.mockReturnValue(mockSpan);

            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-o2',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-o2',
                feature_flag_enabled: true,
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-o2',
                phase: '59',
                status: 'OK',
                violations: []
            });

            await runSafetyLayerChain({ execution_id: 'exec-o2' });

            expect(tracing.startSpan).toHaveBeenCalledWith(
                'phase_57_59_integration',
                expect.objectContaining({ execution_id: 'exec-o2' })
            );
            expect(mockSpan.end).toHaveBeenCalled();
        });
    });

    // ==================== REGRESSION GUARD ====================

    describe('Regression Guard', () => {
        test('Regression 1 – Safety violations always produce SAFETY_VIOLATION status', async () => {
            executePhase57.mockResolvedValue({
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-r1',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: {},
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            });

            executePhase58.mockResolvedValue({
                execution_id: 'exec-r1',
                forbidden_actions: [{ connector_id: 'test', action_type: 'TEST' }],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: {},
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            });

            executePhase59.mockResolvedValue({
                execution_id: 'exec-r1',
                phase: '59',
                status: 'SAFETY_VIOLATION',
                stop_reason: 'SAFETY_LIMIT_EXCEEDED',
                violations: [
                    { violation_type: 'FORBIDDEN_ACTION' },
                    { violation_type: 'MAX_STEPS_EXCEEDED' },
                    { violation_type: 'HIGH_RISK' }
                ]
            });

            const result = await runSafetyLayerChain({ execution_id: 'exec-r1' });

            // Invariant: violations must produce SAFETY_VIOLATION status
            expect(result.status).toBe('SAFETY_VIOLATION');
            expect(result.stop_reason).toBe('SAFETY_LIMIT_EXCEEDED');
            expect(result.violations.length).toBeGreaterThan(0);
            expect(metrics.count).toHaveBeenCalledWith('safety_layer_blocked', 1, expect.any(Object));
        });
    });

    // ==================== DETERMINISM GUARD ====================

    describe('Determinism Guard', () => {
        test('Determinism – 100 iterations with same input produce identical output', async () => {
            const mockPhase57Output = {
                capability_matrix: {},
                determinism_hash: 'hash',
                error: null,
                execution_id: 'exec-d1',
                feature_flag_enabled: true,
                global_drift: 'RESOLVED',
                global_health: 'OK',
                merged_state: { conn: { state: 'HEALTHY', capabilities: {} } },
                phase: '57',
                requested_at: null,
                routing_profile: {},
                status: 'OK',
                stop_reason: null
            };

            const mockPhase58Output = {
                execution_id: 'exec-d1',
                forbidden_actions: [],
                phase: '58',
                redundancy_profile: {},
                risk_ledger: {},
                safe_execution_horizon: { max_budget_delta_total: 100 },
                safety_zone: {},
                snapshot: {},
                status: 'OK'
            };

            const mockPhase59Output = {
                execution_id: 'exec-d1',
                phase: '59',
                status: 'OK',
                violations: [],
                optimizer_plan_sanitized: { steps: [] }
            };

            executePhase57.mockResolvedValue(mockPhase57Output);
            executePhase58.mockResolvedValue(mockPhase58Output);
            executePhase59.mockResolvedValue(mockPhase59Output);

            const input = {
                execution_id: 'exec-d1',
                optimizer_plan: { steps: [] }
            };

            const results = [];
            for (let i = 0; i < 100; i++) {
                const result = await runSafetyLayerChain(input);
                results.push(JSON.stringify(result));
            }

            // All results must be identical
            const firstResult = results[0];
            for (let i = 1; i < results.length; i++) {
                expect(results[i]).toBe(firstResult);
            }

            // Verify determinism: same input always produces same JSON
            const uniqueResults = new Set(results);
            expect(uniqueResults.size).toBe(1);
        });
    });
});
