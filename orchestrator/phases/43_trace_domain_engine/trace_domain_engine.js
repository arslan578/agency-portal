/**
 * Phase 43: Multi-Tenant Trace Domain Engine
 *
 * Deterministic, immutable, workspace-scoped isolation layer.
 * Produces stable trace domain keys for multi-tenant execution environments.
 *
 * Contract Version: trace_domain_v1
 * Feature Flag: FF_MULTI_TENANT_TRACE_DOMAINS
 */

/**
 * Computes trace domain key from tenant metadata.
 * @param {object} envelope - Orchestrator envelope with tenant metadata
 * @returns {object} Envelope with trace_domain attached
 */
function computeTraceDomain(envelope = {}) {
    // Feature flag check
    const FF_MULTI_TENANT_TRACE_DOMAINS = process.env.FF_MULTI_TENANT_TRACE_DOMAINS === 'true';

    if (!FF_MULTI_TENANT_TRACE_DOMAINS) {
        // Return envelope unchanged when flag is off
        return envelope;
    }

    // Validate envelope structure
    const validationResult = validateEnvelope(envelope);
    if (!validationResult.ok) {
        return {
            ok: false,
            code: validationResult.code,
            message: validationResult.message,
            envelope: { execution_id: envelope.execution_id }
        };
    }

    // Extract tenant information
    const { tenant } = envelope;
    const tenant_id = tenant.tenant_id;
    const workspace_id = tenant.workspace_id || null;
    const brand_id = tenant.brand_id || null;
    const requested_at = envelope.metadata?.requested_at;

    // Compute domain key using strict formula
    const domain_key = buildDomainKey(tenant_id, workspace_id, brand_id);

    // Build trace_domain object
    const trace_domain = {
        version: 'trace_domain_v1',
        domain_key,
        components: {
            tenant_id,
            workspace_id,
            brand_id,
            requested_at
        }
    };

    // Emit observability event
    emitTraceDomainEvent({
        execution_id: envelope.execution_id,
        trace_domain_key: domain_key,
        tenant_id,
        workspace_id,
        brand_id,
        timestamp: requested_at
    });

    // Attach trace_domain to envelope (no mutation of original)
    return {
        ...envelope,
        trace_domain
    };
}

/**
 * Validates envelope structure and required fields.
 */
function validateEnvelope(envelope) {
    // Check execution_id
    if (!envelope.execution_id || typeof envelope.execution_id !== 'string') {
        return {
            ok: false,
            code: 'TRACE_DOMAIN_ERROR_MISSING_EXECUTION_ID',
            message: 'execution_id is required and must be a non-empty string'
        };
    }

    // Check tenant object
    if (!envelope.tenant || typeof envelope.tenant !== 'object') {
        return {
            ok: false,
            code: 'TRACE_DOMAIN_ERROR_MALFORMED_TENANT_OBJECT',
            message: 'tenant object is required'
        };
    }

    // Check tenant_id
    if (!envelope.tenant.tenant_id || typeof envelope.tenant.tenant_id !== 'string' || envelope.tenant.tenant_id.trim() === '') {
        return {
            ok: false,
            code: 'TRACE_DOMAIN_ERROR_INVALID_TENANT_ID',
            message: 'tenant.tenant_id must be a non-empty string'
        };
    }

    // Check workspace_id (optional, but if present must be non-empty string)
    if (envelope.tenant.workspace_id !== undefined &&
        envelope.tenant.workspace_id !== null) {
        if (typeof envelope.tenant.workspace_id !== 'string' || envelope.tenant.workspace_id === '') {
            return {
                ok: false,
                code: 'TRACE_DOMAIN_ERROR_INVALID_WORKSPACE_ID',
                message: 'tenant.workspace_id must be a non-empty string or null'
            };
        }
    }

    // Check brand_id (optional, but if present must be non-empty string)
    if (envelope.tenant.brand_id !== undefined &&
        envelope.tenant.brand_id !== null) {
        if (typeof envelope.tenant.brand_id !== 'string' || envelope.tenant.brand_id === '') {
            return {
                ok: false,
                code: 'TRACE_DOMAIN_ERROR_INVALID_BRAND_ID',
                message: 'tenant.brand_id must be a non-empty string or null'
            };
        }
    }

    return { ok: true };
}

/**
 * Builds domain key using strict formula.
 * Formula: TENANT:${tenant_id}::WS:${workspace_id || "null"}::BRAND:${brand_id || "null"}
 */
function buildDomainKey(tenant_id, workspace_id, brand_id) {
    const wsValue = workspace_id === null || workspace_id === undefined ? 'null' : workspace_id;
    const brandValue = brand_id === null || brand_id === undefined ? 'null' : brand_id;

    return `TENANT:${tenant_id}::WS:${wsValue}::BRAND:${brandValue}`;
}

/**
 * Emits observability event for trace domain computation.
 */
function emitTraceDomainEvent(data) {
    console.log(JSON.stringify({
        event_type: 'TRACE_DOMAIN_COMPUTED',
        execution_id: data.execution_id,
        trace_domain_key: data.trace_domain_key,
        tenant_id: data.tenant_id,
        workspace_id: data.workspace_id,
        brand_id: data.brand_id,
        timestamp: data.timestamp
    }));
}

module.exports = {
    computeTraceDomain
};
