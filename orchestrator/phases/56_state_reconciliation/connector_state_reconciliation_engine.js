/**
 * Phase 56: Autonomous State Reconciliation Engine
 * 
 * Converts Phase 55 execution truth into authoritative connector states.
 * Pure observation - NO IO, NO execution, NO retries.
 * 
 * Input Contract: connector_state_reconciliation_input_v1
 * Output Contract: connector_state_reconciliation_output_v1
 * Feature Flag: FF_STATE_RECONCILIATION_ENGINE
 *
 * // Phase 56 produces states strictly conforming to Phase 27B connector_backplane_v1.snapshot_shape.
 */

const crypto = require('crypto');
const { logStructured } = require('../../shared/logging');
const { startSpan } = require('../../shared/tracing');
const { metrics } = require('../../shared/metrics');

/**
 * Execute Phase 56: State Reconciliation
 */
function reconcileConnectorState(envelope) {
    const { execution_id, phase_55_snapshot, timestamp } = envelope;
    const reconciliation_timestamp = new Date().toISOString();

    // 1. Feature flag check (MUST return valid contract shape)
    if (process.env.FF_STATE_RECONCILIATION_ENGINE !== 'true') {
        return {
            execution_id,
            connector_state: {},
            reconciliation_timestamp,
            determinism_hash: computeDeterministicHash({}),
            feature_flag_enabled: false,
            stop_reason: 'FEATURE_DISABLED',
            status: 'OK',
            error: null
        };
    }

    // 2. Input validation
    const validationError = validateInput(envelope);
    if (validationError) {
        return createErrorResponse(execution_id, validationError, reconciliation_timestamp);
    }

    // 3. Start observability
    const span = startSpan('state_reconciliation', { execution_id });
    const connectorKeys = Object.keys(phase_55_snapshot.connector_metadata || {});

    logStructured('state_reconciliation_start', {
        execution_id,
        phase: 56,
        connector_count: connectorKeys.length,
        status: 'START'
    });
    metrics.count('state_reconciliation.invoked', 1);

    // 4. Deep clone inputs (no mutation)
    const originalEnvelope = JSON.parse(JSON.stringify(envelope));

    try {
        // 5. Build per-connector aggregates
        const connectorAggregates = aggregatePerConnector(phase_55_snapshot);

        // 6. Normalize into canonical states
        const connectorStates = {};
        for (const [key, aggregate] of Object.entries(connectorAggregates)) {
            connectorStates[key] = normalizeConnectorState(
                key,
                aggregate,
                phase_55_snapshot.capability_matrix || {},
                phase_55_snapshot.policy_flags || {},
                phase_55_snapshot.connector_metadata || {}
            );
        }

        // 7. Compute determinism hash
        const hash = computeDeterministicHash(connectorStates);

        // 8. Verify no mutation (use canonical comparison)
        const originalCanonical = JSON.stringify(sortObjectKeys(originalEnvelope));
        const currentCanonical = JSON.stringify(sortObjectKeys(envelope));
        if (originalCanonical !== currentCanonical) {
            throw new Error('Input envelope was mutated');
        }

        // 9. Observability completion
        logStructured('state_reconciliation_complete', {
            execution_id,
            phase: 56,
            determinism_hash: hash,
            connector_count: Object.keys(connectorStates).length,
            status: 'OK'
        });
        span.end();

        // 10. Return snapshot
        return {
            execution_id,
            connector_state: connectorStates,
            reconciliation_timestamp,
            determinism_hash: hash,
            status: 'OK',
            error: null
        };

    } catch (error) {
        logStructured('state_reconciliation_error', {
            execution_id,
            error: error.message,
            status: 'ERROR'
        });
        span.end();

        return createErrorResponse(execution_id, error.message, reconciliation_timestamp);
    }
}

/**
 * Validate input envelope
 */
function validateInput(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        return 'Envelope must be an object';
    }

    if (!envelope.execution_id) {
        return 'Missing required field: execution_id';
    }

    if (!envelope.phase_55_snapshot) {
        return 'Missing required field: phase_55_snapshot';
    }

    if (!envelope.phase_55_snapshot.per_action) {
        return 'Missing required field: phase_55_snapshot.per_action';
    }

    if (!envelope.phase_55_snapshot.capability_matrix) {
        return 'Missing required field: phase_55_snapshot.capability_matrix';
    }

    return null;
}

/**
 * Aggregate actions per connector
 */
function aggregatePerConnector(snapshot) {
    const aggregates = {};
    const actions = snapshot.actions || [];

    // Start with all connectors from metadata
    const allConnectors = Object.keys(snapshot.connector_metadata || {});
    for (const key of allConnectors) {
        aggregates[key] = { actions: [], results: {} };
    }

    // Add actions to their connectors
    for (const action of actions) {
        const key = action.connector_key;
        if (!aggregates[key]) {
            aggregates[key] = { actions: [], results: {} };
        }
        aggregates[key].actions.push(action);

        // Get result from per_action
        const result = snapshot.per_action?.[action.action_id];
        if (result) {
            aggregates[key].results[action.action_id] = result;
        }
    }

    return aggregates;
}

/**
 * Normalize connector state from aggregate
 */
function normalizeConnectorState(connector_key, aggregate, capabilities, policy, metadata) {
    const { actions, results } = aggregate;

    // Handle missing metadata (DEFENSIVE)
    if (!metadata[connector_key]) {
        return {
            auth_state: 'UNKNOWN',
            api_version_state: {
                current_version: 'unknown',
                target_version: null,
                upgrade_attempted: false,
                upgrade_success: false
            },
            structural_state: {
                rebuilt: false,
                partial_rebuild: false,
                needs_rebuild: true, // Truth is unknown
                sandbox_verified: false
            },
            routing_state: {
                active: 'primary',
                fallback: null,
                switched: false,
                switch_attempted: false
            },
            health_state: 'BROKEN',
            drift_status: 'UNRESOLVED'
        };
    }

    // Aggregate each state dimension
    const authState = aggregateAuthState(connector_key, actions, results, capabilities, metadata);
    const apiVersionState = aggregateApiVersionState(connector_key, actions, results, capabilities, metadata);
    const structuralState = aggregateStructuralState(connector_key, actions, results, capabilities, policy, metadata);
    const routingState = aggregateRoutingState(connector_key, actions, results, metadata);

    // Compute drift status (uses reconciled states)
    const driftStatus = computeDriftStatus(
        connector_key,
        actions,
        results,
        policy,
        authState,
        structuralState,
        apiVersionState,
        routingState
    );

    // Compute health state (uses all dimensions + drift)
    const healthState = computeHealthState(
        authState.auth_state,
        structuralState,
        apiVersionState,
        routingState,
        driftStatus
    );

    return {
        auth_state: authState.auth_state,
        api_version_state: apiVersionState,
        structural_state: structuralState,
        routing_state: routingState,
        health_state: healthState,
        drift_status: driftStatus
    };
}

/**
 * Aggregate auth state (TRUTH OVER OPTIMISM)
 */
function aggregateAuthState(connector_key, actions, perAction, capabilities, metadata) {
    // START FROM TRUTH: Use metadata.auth_state if present
    let baseAuthState = metadata?.[connector_key]?.auth_state || 'UNKNOWN';

    // Find rotation action
    const rotateAction = actions.find(a =>
        a.action_type === 'ROTATE_CREDENTIALS' && a.connector_key === connector_key
    );

    // If rotation was attempted
    if (rotateAction) {
        // Check capability supremacy
        if (!capabilities[connector_key]?.can_rotate_credentials) {
            // Cannot infer success without capability
            return { auth_state: 'INVALID' };
        }

        const result = perAction[rotateAction.action_id];
        if (result?.status === 'SUCCESS') {
            return { auth_state: 'ROTATED' };
        } else if (result?.error_code === 'AUTH_EXPIRED') {
            return { auth_state: 'EXPIRED' };
        } else {
            return { auth_state: 'INVALID' };
        }
    }

    // Check for failed auth-related actions
    const authCheckActions = actions.filter(a =>
        a.action_type === 'AUTH_CHECK' && a.connector_key === connector_key
    );

    for (const authCheck of authCheckActions) {
        const result = perAction[authCheck.action_id];
        if (result?.status === 'ERROR') {
            if (result.error_code === 'AUTH_EXPIRED') {
                return { auth_state: 'EXPIRED' };
            }
            return { auth_state: 'INVALID' };
        }
    }

    // No rotation, no auth checks failed: preserve metadata state
    return { auth_state: baseAuthState };
}

/**
 * Aggregate API version state (WITH CAPABILITY SUPREMACY)
 */
function aggregateApiVersionState(connector_key, actions, perAction, capabilities, metadata) {
    const upgradeAction = actions.find(a =>
        a.action_type === 'UPGRADE_API_VERSION' && a.connector_key === connector_key
    );

    const currentVersion = metadata?.[connector_key]?.api_version || 'unknown';

    if (!upgradeAction) {
        return {
            current_version: currentVersion,
            target_version: null,
            upgrade_attempted: false,
            upgrade_success: false
        };
    }

    // CAPABILITY SUPREMACY: Must have upgrade capability
    const canUpgrade = capabilities[connector_key]?.can_upgrade_api_version === true;

    if (!canUpgrade) {
        // Cannot infer success without capability
        return {
            current_version: currentVersion,
            target_version: upgradeAction.payload?.target_version || null,
            upgrade_attempted: true,
            upgrade_success: false
        };
    }

    const result = perAction[upgradeAction.action_id];
    const targetVersion = upgradeAction.payload?.target_version || null;

    return {
        current_version: result?.status === 'SUCCESS' ? (targetVersion || currentVersion) : currentVersion,
        target_version: targetVersion,
        upgrade_attempted: true,
        upgrade_success: result?.status === 'SUCCESS'
    };
}

/**
 * Aggregate structural state (NUANCED CAPABILITY SUPREMACY)
 */
function aggregateStructuralState(connector_key, actions, perAction, capabilities, policy, metadata) {
    const rebuildActions = actions.filter(a =>
        a.action_type === 'REBUILD_CONNECTOR' && a.connector_key === connector_key
    );

    // No rebuild actions attempted
    if (rebuildActions.length === 0) {
        return {
            rebuilt: false,
            partial_rebuild: false,
            needs_rebuild: metadata?.[connector_key]?.needs_rebuild || false,
            sandbox_verified: checkSandboxVerified(connector_key, actions, perAction, capabilities)
        };
    }

    // Rebuild was prescribed/attempted
    const canRebuild = capabilities[connector_key]?.can_rebuild === true;
    const policyAllows = policy.allow_rebuild !== false;

    // If capability or policy blocks rebuild
    if (!canRebuild || !policyAllows) {
        return {
            rebuilt: false,
            partial_rebuild: false,
            needs_rebuild: true, // Prescribed but blocked
            sandbox_verified: false
        };
    }

    // Evaluate rebuild results
    let hasFullSuccess = false;
    let hasPartialSuccess = false;
    let hasFailure = false;

    for (const rebuildAction of rebuildActions) {
        const result = perAction[rebuildAction.action_id];
        const isPartial = rebuildAction.payload?.partial === true;

        if (result?.status === 'SUCCESS') {
            if (isPartial) {
                hasPartialSuccess = true;
            } else {
                hasFullSuccess = true;
            }
        } else {
            hasFailure = true;
        }
    }

    return {
        rebuilt: hasFullSuccess && !hasFailure,
        partial_rebuild: hasPartialSuccess && !hasFullSuccess,
        needs_rebuild: hasFailure || (!hasFullSuccess && !hasPartialSuccess),
        sandbox_verified: checkSandboxVerified(connector_key, actions, perAction, capabilities)
    };
}

/**
 * Check if sandbox was verified
 */
function checkSandboxVerified(connector_key, actions, perAction, capabilities) {
    if (!capabilities[connector_key]?.supports_sandbox) {
        return false; // Cannot verify without capability
    }

    const sandboxAction = actions.find(a =>
        a.action_type === 'SANDBOX_RETRY' && a.connector_key === connector_key
    );

    if (!sandboxAction) return false;

    const result = perAction[sandboxAction.action_id];
    return result?.status === 'SUCCESS';
}

/**
 * Aggregate routing state
 */
function aggregateRoutingState(connector_key, actions, perAction, metadata) {
    const switchAction = actions.find(a =>
        a.action_type === 'SWITCH_CONNECTOR' && a.connector_key === connector_key
    );

    const activeConnector = metadata?.[connector_key]?.active_connector || 'primary';
    const fallbackConnector = metadata?.[connector_key]?.fallback_connector || null;

    if (!switchAction) {
        return {
            active: activeConnector,
            fallback: fallbackConnector,
            switched: false,
            switch_attempted: false
        };
    }

    const result = perAction[switchAction.action_id];
    const targetConnector = switchAction.payload?.to;

    return {
        active: result?.status === 'SUCCESS' ? targetConnector : activeConnector,
        fallback: fallbackConnector,
        switched: result?.status === 'SUCCESS',
        switch_attempted: true
    };
}

/**
 * Compute drift status (USES RECONCILED STATES)
 */
function computeDriftStatus(
    connector_key,
    allActions,
    perAction,
    policy,
    authState,
    structuralState,
    apiVersionState,
    routingState
) {
    // FIX: perAction is an object, not array
    const results = Object.values(perAction || {});

    // No actions taken
    if (allActions.length === 0) {
        return 'UNRESOLVED';
    }

    // Use reconciled states as truth source - ONLY CRITICAL ISSUES
    const hasCriticalIssues =
        authState.auth_state === 'INVALID' ||
        authState.auth_state === 'EXPIRED' ||
        (structuralState.needs_rebuild && !structuralState.rebuilt && !structuralState.partial_rebuild);

    if (hasCriticalIssues) {
        // Check if blocked by policy
        if (policy.forbid_rebuild && structuralState.needs_rebuild) {
            return 'UNRESOLVED'; // Still broken but policy blocks fix
        }
        return 'UNRESOLVED';
    }

    // Check action outcomes
    const successCount = results.filter(r => r.status === 'SUCCESS').length;
    const failureCount = results.filter(r => r.status === 'ERROR').length;

    // Check for state divergence despite action success (Capability Supremacy or other overrides)
    const stateDivergence =
        (apiVersionState.upgrade_attempted && !apiVersionState.upgrade_success) ||
        (routingState.switch_attempted && !routingState.switched);

    // All prescribed actions succeeded and no critical issues AND no state divergence
    if (failureCount === 0 && successCount > 0 && !stateDivergence) {
        return 'RESOLVED';
    }

    // Mixed results OR non-critical failures (upgrade, routing) OR state divergence
    if ((successCount > 0 && failureCount > 0) || stateDivergence) {
        return 'PARTIALLY_RESOLVED';
    }

    // Only non-critical failures (upgrade, routing)
    const hasOnlyNonCriticalFailures =
        !hasCriticalIssues &&
        failureCount > 0 &&
        (apiVersionState.upgrade_attempted && !apiVersionState.upgrade_success ||
            routingState.switch_attempted && !routingState.switched);

    if (hasOnlyNonCriticalFailures) {
        return 'PARTIALLY_RESOLVED';
    }

    // All failed with critical issues
    return 'UNRESOLVED';
}

/**
 * Compute health state (INCLUDES ROUTING + DRIFT COORDINATION)
 */
function computeHealthState(authState, structuralState, apiVersionState, routingState, driftStatus) {
    // BROKEN: Critical auth or structural failures
    if (authState === 'INVALID' || authState === 'EXPIRED') {
        return 'BROKEN';
    }

    if (structuralState.needs_rebuild && !structuralState.rebuilt && !structuralState.partial_rebuild) {
        return 'BROKEN';
    }

    // DEGRADED: Partial rebuild, failed upgrade, or routing issues
    if (structuralState.partial_rebuild) {
        return 'DEGRADED';
    }

    if (apiVersionState.upgrade_attempted && !apiVersionState.upgrade_success) {
        return 'DEGRADED';
    }

    // Routing failures indicate degraded state
    if (routingState.switch_attempted && !routingState.switched) {
        return 'DEGRADED';
    }

    // Drift PARTIALLY_RESOLVED is degraded
    if (driftStatus === 'PARTIALLY_RESOLVED') {
        return 'DEGRADED';
    }

    // Drift UNRESOLVED is broken
    if (driftStatus === 'UNRESOLVED') {
        return 'BROKEN';
    }

    // OK: All good
    return 'OK';
}

/**
 * Compute deterministic hash
 */
function computeDeterministicHash(connectorStates) {
    // Sort object keys lexicographically
    const sortedKeys = Object.keys(connectorStates).sort();

    // Build canonical JSON
    const canonical = {};
    for (const key of sortedKeys) {
        canonical[key] = sortObjectKeys(connectorStates[key]);
    }

    // Compute hash
    const jsonString = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Sort object keys recursively for determinism
 */
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys).sort();

    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
}

/**
 * Create error response
 */
function createErrorResponse(execution_id, errorMessage, reconciliation_timestamp) {
    return {
        execution_id,
        connector_state: {},
        reconciliation_timestamp,
        determinism_hash: computeDeterministicHash({}),
        error: errorMessage,
        status: 'ERROR'
    };
}

module.exports = { reconcileConnectorState };
