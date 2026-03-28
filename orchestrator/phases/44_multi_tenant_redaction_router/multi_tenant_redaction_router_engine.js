/**
 * Phase 44: Multi Tenant Redaction Router
 *
 * Contract: redaction_router_v1
 * Feature Flag: FF_MULTI_TENANT_REDACTION_ROUTER
 */

const redactionRules = require('../../policy/rules/redaction_rules.json');

function createErrorEnvelope(code, message, executionId) {
    return {
        ok: false,
        code,
        message,
        envelope: executionId ? { execution_id: executionId } : {}
    };
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function resolveRuleSet(traceDomainKey, rulesDb = redactionRules) {
    if (!rulesDb || typeof rulesDb !== 'object') {
        return { error: 'REDACTION_RULESET_MALFORMED' };
    }

    const routing = rulesDb.routing || {};
    const ruleSets = rulesDb.rule_sets || {};
    const defaultRuleSetId = rulesDb.default_rule_set;

    // Exact match
    if (routing[traceDomainKey]) {
        const id = routing[traceDomainKey];
        return ruleSets[id]
            ? { id, rules: ruleSets[id] }
            : { error: 'REDACTION_RULESET_NOT_FOUND' };
    }

    // Simple prefix match on tenant portion as a first version
    const tenantPrefix = traceDomainKey.split('::')[0];
    if (routing[tenantPrefix]) {
        const id = routing[tenantPrefix];
        return ruleSets[id]
            ? { id, rules: ruleSets[id] }
            : { error: 'REDACTION_RULESET_NOT_FOUND' };
    }

    // Fallback to default
    if (defaultRuleSetId && ruleSets[defaultRuleSetId]) {
        return { id: defaultRuleSetId, rules: ruleSets[defaultRuleSetId] };
    }

    return { error: 'REDACTION_RULESET_NOT_FOUND' };
}

function applyRulesToView(clone, rules, viewName, stats, applications) {
    if (!clone || typeof clone !== 'object') return clone;

    function walk(node, pathParts) {
        if (node === null || typeof node !== 'object') {
            stats.fields_inspected += 1;
            return node;
        }

        if (Array.isArray(node)) {
            return node.map((item, index) => walk(item, pathParts.concat(String(index))));
        }

        const result = {};
        for (const key of Object.keys(node)) {
            const value = node[key];
            const currentPath = pathParts.concat(key);
            const pathString = currentPath.join('.');

            let redactedValue = value;
            let redacted = false;

            for (const rule of rules) {
                if (!rule.views || !rule.views.includes(viewName)) continue;

                const match = rule.match || {};
                const fieldNames = match.field_names || [];
                const valueTypes = match.value_types || [];

                const fieldNameMatches =
                    fieldNames.length === 0 || fieldNames.includes(key);

                const valueType = typeof value;
                const valueTypeMatches =
                    valueTypes.length === 0 || valueTypes.includes(valueType);

                if (fieldNameMatches && valueTypeMatches) {
                    redacted = true;
                    stats.fields_redacted += 1;

                    applications.push({
                        rule_id: rule.rule_id,
                        reason_code: rule.reason_code,
                        paths: [pathString],
                        view_targets: rule.views
                    });

                    if (value !== null && typeof value === 'object') {
                        redactedValue = null;
                    } else {
                        redactedValue = '[REDACTED]';
                    }

                    break;
                }
            }

            if (!redacted) {
                redactedValue = walk(value, currentPath);
            }

            result[key] = redactedValue;
        }

        return result;
    }

    return walk(clone, []);
}

/**
 * Main entry point
 *
 * @param {object} envelope
 * @returns {object} envelope with redaction block attached, or error envelope
 */
function routeRedaction(envelope) {
    const FF_MULTI_TENANT_REDACTION_ROUTER =
        process.env.FF_MULTI_TENANT_REDACTION_ROUTER === 'true';

    if (!FF_MULTI_TENANT_REDACTION_ROUTER) {
        return envelope;
    }

    const executionId = envelope && envelope.execution_id;

    if (!envelope || typeof envelope !== 'object') {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'Envelope must be a non null object',
            executionId
        );
    }

    if (!isNonEmptyString(executionId)) {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'execution_id is required and must be a non empty string',
            executionId
        );
    }

    const traceDomain = envelope.trace_domain || {};

    if (!isNonEmptyString(traceDomain.trace_domain_key)) {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'trace_domain.trace_domain_key is required and must be a non empty string',
            executionId
        );
    }

    const tenant = envelope.tenant || {};
    const workspace = envelope.workspace || {};
    const brand = envelope.brand || {};

    if (tenant.tenant_id !== undefined && !isNonEmptyString(tenant.tenant_id)) {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'tenant.tenant_id must be a non empty string when present',
            executionId
        );
    }

    if (workspace.workspace_id !== undefined && !isNonEmptyString(workspace.workspace_id)) {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'workspace.workspace_id must be a non empty string when present',
            executionId
        );
    }

    if (brand.brand_id !== undefined && !isNonEmptyString(brand.brand_id)) {
        return createErrorEnvelope(
            'INVALID_REDACTION_ROUTER_INPUT',
            'brand.brand_id must be a non empty string when present',
            executionId
        );
    }

    const { id: ruleSetId, rules, error } = resolveRuleSet(
        traceDomain.trace_domain_key
    );

    if (error) {
        return createErrorEnvelope(
            error,
            'Unable to resolve redaction rule set for trace domain key',
            executionId
        );
    }

    const baseCloneForLog = deepClone(envelope);
    const baseCloneForSnapshot = deepClone(envelope);
    const baseCloneForMetrics = deepClone(envelope);

    const stats = { fields_redacted: 0, fields_inspected: 0 };
    const applications = [];

    const logEnvelope = applyRulesToView(
        baseCloneForLog,
        rules,
        'log',
        stats,
        applications
    );

    const snapshotEnvelope = applyRulesToView(
        baseCloneForSnapshot,
        rules,
        'snapshot',
        stats,
        applications
    );

    const metricsEnvelope = applyRulesToView(
        baseCloneForMetrics,
        rules,
        'metrics',
        stats,
        applications
    );

    // Observability Hook
    console.log(JSON.stringify({
        event_type: 'REDACTION_ROUTED',
        execution_id: executionId,
        trace_domain_key: traceDomain.trace_domain_key,
        rule_set_id: ruleSetId,
        fields_redacted: stats.fields_redacted,
        fields_inspected: stats.fields_inspected,
        timestamp: new Date().toISOString()
    }));

    return {
        ...envelope,
        redaction: {
            contract_version: 'redaction_router_v1',
            trace_domain_key: traceDomain.trace_domain_key,
            views: {
                log_envelope: logEnvelope,
                snapshot_envelope: snapshotEnvelope,
                metrics_envelope: metricsEnvelope
            },
            plan: {
                applied_rule_set: ruleSetId,
                rules_applied: applications,
                stats
            }
        }
    };
}

module.exports = {
    routeRedaction,
    _internal: {
        resolveRuleSet,
        applyRulesToView,
        deepClone,
        isNonEmptyString
    }
};
