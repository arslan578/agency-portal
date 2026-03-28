"use strict";

const crypto = require("crypto");
const { logStructured } = require("../../../orchestrator/shared/logging");
const metrics = require("../../../orchestrator/shared/metrics");
const tracing = require("../../../orchestrator/shared/tracing");

const PHASE_ID = "PIB_TIKTOK_PHASE_9";
const FEATURE_FLAG = "FF_PIB_TIKTOK_PHASE_9";
const OUTPUT_CONTRACT_VERSION = "pib_tiktok_phase_9_output_v1";

const FORBIDDEN_FIELDS = ["_debug", "debug_info", "internal_only"];

/**
 * PIB(TikTok) Phase-9: Safety Horizon Binding
 * Deterministic binding of upstream PIB artifacts into Safety Horizon input shape.
 * Pure logic, no IO.
 */
function execute(input) {
    let span;
    const executionId = safeExecutionId(input);

    try {
        span = tracing.startSpan("pib_tiktok_phase_9", {
            phase: PHASE_ID,
            execution_id: executionId
        });

        // 1. Validation
        const validationError = validateInput(input, executionId);
        if (validationError) {
            logEvent("ERROR", executionId);
            recordMetrics("error", input);
            if (span) span.setAttribute("status", "ERROR");
            return validationError;
        }

        // 2. Feature Flag Check
        if (!input.feature_flags[FEATURE_FLAG]) {
            logEvent("NO_OP", executionId);
            recordMetrics("disabled", input);
            if (span) span.setAttribute("status", "NO_OP");
            return buildNoOpResponse(executionId);
        }

        // 3. Core Logic: Safety Horizon Binding
        const binding = determineSafetyHorizonBinding(input);

        // 4. Output Construction
        const canonicalHash = computeCanonicalHash(binding);

        const output = {
            status: "OK",
            execution_id: executionId,
            phase: PHASE_ID,
            output_contract_version: OUTPUT_CONTRACT_VERSION,
            safety_horizon_binding: binding,
            metadata: {
                canonical_hash: canonicalHash,
                derived_at: "DETERMINISTIC"
            }
        };

        logEvent("OK", executionId);
        recordMetrics("processed", input);
        if (span) span.setAttribute("status", "OK");

        return output;

    } catch (err) {
        logStructured("pib_tiktok_phase_9_crash", { execution_id: executionId, error: err.stack });
        recordMetrics("crash", input);
        if (span) span.setAttribute("status", "ERROR");
        return buildError(input, "INTERNAL_ERROR", "Unexpected internal error: " + err.message, { stack: err.stack }, executionId);
    } finally {
        if (span) span.end();
    }
}

// -----------------------------------------------------------------------------
// Core Logic: Safety Horizon Binding
// -----------------------------------------------------------------------------

function determineSafetyHorizonBinding(input) {
    const { capability_surface, routing_profile, response_normalizer_spec, error_resolver_spec } = input;

    // 1. Calculate Global Risk Components
    // Rule 5.1: Quota Pressure
    const quotaPressure = calculateQuotaPressure(capability_surface);

    // Rule 5.2: Routing Risk
    const routingRisk = calculateRoutingRisk(routing_profile);

    // Rule 5.3: Policy Risks
    const policyRisks = calculatePolicyRisks(capability_surface);

    // Rule 5.4: Failure Modes (Global set for this binding context)
    const failureModes = calculateFailureModes(response_normalizer_spec, error_resolver_spec);

    // Rule 5.5: Enforcement Grade
    const enforcementGrade = calculateEnforcementGrade(routingRisk, policyRisks);

    // 2. Build Operation Safety Map
    // We iterate over operations defined in response_normalizer_spec (as P6 is the normalization source)
    // For PIB-9 binding, we apply the global derived risks to each operation unless we had per-op overrides.
    // The prompt implies a generic derivation "Per-operation risk metadata" but the rules 5.1-5.3 use global inputs.
    // So we project the global calculations onto each operation.
    const operationSafety = {};
    const ops = (response_normalizer_spec.operations || []);

    ops.forEach(op => {
        if (op && op.operation) {
            operationSafety[op.operation] = {
                quota_pressure: quotaPressure,
                failure_modes: failureModes, // Rule 5.4 says derive strictly, implies list.
                policy_risks: policyRisks,
                routing_risk: routingRisk,
                enforcement_grade: enforcementGrade
            };
        }
    });

    // 3. Global Connector Stability
    // Rule 5.6
    const connectorStability = calculateConnectorStability(routingRisk, quotaPressure);

    // 4. Safety Hints
    const safeAbortCodes = error_resolver_spec.resolver_rules && error_resolver_spec.resolver_rules.safe_abort_categories
        ? [...error_resolver_spec.resolver_rules.safe_abort_categories].sort()
        : [];

    // Retry sensitive/Non-retryable:
    // "retry_sensitive_domains" -> implied from P5 buckets? Prompt doesn't specify logic, let's use buckets if available or empty.
    // "non_retryable_categories" -> derived from P7 where policy is null?
    // Prompt says "safety_hints ... safe_abort_codes ... derived from error_resolver_spec".
    // For the others, if no rule is given, deterministic empty or best-effort from P7.
    // P7 has category_to_retry_policy. Keys where value is null are non-retryable.
    const nonRetryable = [];
    if (error_resolver_spec.resolver_rules && error_resolver_spec.resolver_rules.category_to_retry_policy) {
        Object.entries(error_resolver_spec.resolver_rules.category_to_retry_policy).forEach(([cat, policy]) => {
            if (policy === null) nonRetryable.push(cat);
        });
    }
    nonRetryable.sort();

    // Patch 5: normalization_health Derivation
    const normalizationHealth = deriveNormalizationHealth(response_normalizer_spec);

    return {
        operation_safety: sortObjectKeys(operationSafety),
        global_risk_profile: {
            connector_stability: connectorStability,
            // Patch 1: quota_class derivation
            quota_class: deriveQuotaClass(capability_surface),
            policy_exposure: (policyRisks.includes("STATE_MUTATION") || policyRisks.includes("IRREVERSIBLE_CHANGE")) ? "HIGH" : "LOW"
        },
        safety_hints: {
            safe_abort_codes: safeAbortCodes,
            // Patch 4: retry_sensitive_domains derivation
            retry_sensitive_domains: deriveRetrySensitiveDomains(response_normalizer_spec, error_resolver_spec),
            non_retryable_categories: nonRetryable,
            normalization_health: normalizationHealth
        }
    };
}

// Patch 1 Helper
function deriveQuotaClass(caps) {
    if (!caps || !caps.quota || !Array.isArray(caps.quota.buckets) || caps.quota.buckets.length === 0) {
        return "UNBOUNDED";
    }
    const hasDaily = caps.quota.buckets.some(b => typeof b.unit === "string" && b.unit.toUpperCase() === "DAY");
    if (hasDaily) return "DAILY_RESET";
    return "FIXED";
}

// Patch 4 Helper
function deriveRetrySensitiveDomains(normSpec, errorSpec) {
    const out = [];
    const domainMap = (normSpec.error_mapping_plan && normSpec.error_mapping_plan.google_domain_to_category) || {};
    const policyMap = (errorSpec.resolver_rules && errorSpec.resolver_rules.category_to_retry_policy) || {};

    Object.entries(domainMap).forEach(([domain, category]) => {
        const policy = policyMap[category];
        if (policy !== null && policy !== undefined) {
            out.push(domain);
        }
    });

    return out.sort();
}

// Patch 5 Helper
function deriveNormalizationHealth(normSpec) {
    const ops = normSpec.operations || [];
    for (const op of ops) {
        if (!op.normalization_plan ||
            !Array.isArray(op.normalization_plan.strip_fields) ||
            typeof op.normalization_plan.rename_map !== "object") {
            return "IMPAIRED";
        }
    }
    return "GOOD";
}

// Rule 5.1
function calculateQuotaPressure(caps) {
    // "Derived from capability_surface.quota.buckets"
    // > 10 req/min -> LOW
    // 5-10 -> MEDIUM
    // < 5 -> HIGH
    // Missing -> MEDIUM

    if (!caps || !caps.quota || !Array.isArray(caps.quota.buckets) || caps.quota.buckets.length === 0) {
        return "MEDIUM";
    }

    // Conservative: take the minimum rate limit across all buckets
    let minRate = Infinity;
    for (const b of caps.quota.buckets) {
        // bucket shape unknown from P1 output, assuming { rate: number, unit: "MINUTE" } or similar
        // If strictly following P1 output, it doesn't have quota. So this falls back to MEDIUM.
        // If it did, we'd check it.
        if (typeof b.rate === "number") {
            minRate = Math.min(minRate, b.rate);
        }
    }

    if (minRate === Infinity) return "MEDIUM"; // malformed buckets
    if (minRate > 10) return "LOW";
    if (minRate >= 5) return "MEDIUM";
    return "HIGH";
}

// Rule 5.2
function calculateRoutingRisk(profile) {
    // routing_profile.retry_alignment
    // max_retries = 0 -> HIGH
    // max_retries <= 2 -> MEDIUM
    // else -> LOW

    // Check global alignment or policy specifics?
    // "Derived from routing_profile.retry_alignment" usually implies the global logic block.
    // Assuming routing_profile.retry_alignment has max_retries_ceiling or similar default?
    // P5 spec says `retry_alignment` has `policies`.
    // Let's look for a standard 'max_retries' property at the alignment level or infer from policies.
    // If not clear, default to "MEDIUM" (safest).
    // Actually, P5 output shows `retry_alignment` has `policies`.
    // Let's check if there's a global setting. If not, maybe check the policies.
    // Prompt says "If policy has max_retries=0". This implies iterating policies.
    // Aggregation: if ANY policy is 0? Or ALL?
    // "If policy has..." singular. Maybe check the default policy?
    // Safer to check input structure. If `retry_alignment.max_retries` exists, use it.
    // If not, use defined policies.
    // If no data -> MEDIUM.

    // Let's assume input might have `max_retries` on `retry_alignment` based on P5 gen.
    const align = profile.retry_alignment || {};
    let val = align.max_retries;

    // If undefined there, try policies[0]?
    if (val === undefined && Array.isArray(align.policies) && align.policies.length > 0) {
        // Patch 2: Forbidden by spec: no inference allowed
        val = undefined;
    }

    if (val === undefined) return "MEDIUM"; // Fallback

    if (val === 0) return "HIGH";
    if (val <= 2) return "MEDIUM";
    return "LOW";
}

// Rule 5.3
function calculatePolicyRisks(caps) {
    // capability_surface.capabilities
    // Contains "WRITE_OPERATION" -> STATE_MUTATION
    // Contains "DELETE_OPERATION" -> IRREVERSIBLE_CHANGE
    // Missing both -> NO_MUTATION

    const risks = new Set();
    const capList = (caps && Array.isArray(caps.capabilities)) ? caps.capabilities : [];

    if (capList.includes("WRITE_OPERATION")) risks.add("STATE_MUTATION");
    if (capList.includes("DELETE_OPERATION")) risks.add("IRREVERSIBLE_CHANGE");

    if (risks.size === 0) risks.add("NO_MUTATION");

    return Array.from(risks).sort();
}

// Rule 5.4
function calculateFailureModes(normSpec, errorSpec) {
    // P6 -> "NORMALIZATION_FAILURE"
    // P7 -> Retry Categories

    const modes = new Set();

    // P6 Check - if we have a plan, we assume normalization checks are active
    if (normSpec && normSpec.error_mapping_plan) {
        modes.add("NORMALIZATION_FAILURE");
    }

    // Patch 3: Use Mapped Retry Policies
    if (errorSpec && errorSpec.resolver_rules && errorSpec.resolver_rules.category_to_retry_policy) {
        Object.entries(errorSpec.resolver_rules.category_to_retry_policy)
            .forEach(([cat, policy]) => {
                if (policy === null) modes.add(cat);
                else modes.add(policy);
            });
    }

    return Array.from(modes).sort();
}

// Rule 5.5
function calculateEnforcementGrade(routingRisk, policyRisks) {
    // Routing HIGH -> STRICT
    // Policy contains STATE_MUTATION -> MODERATE
    // Else -> LENIENT

    if (routingRisk === "HIGH") return "STRICT";
    if (policyRisks.includes("STATE_MUTATION")) return "MODERATE";
    return "LENIENT";
}

// Rule 5.6
function calculateConnectorStability(routingRisk, quotaPressure) {
    // ANY op routing HIGH -> DEGRADED (Since we use global routing risk, it applies to all)
    // ANY op quota HIGH -> UNSTABLE
    // Else STABLE

    if (routingRisk === "HIGH") return "DEGRADED";
    if (quotaPressure === "HIGH") return "UNSTABLE";
    return "STABLE";
}


// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateInput(input, executionId) {
    if (!input || typeof input !== "object") {
        return buildError(input, "INVALID_INPUT", "Input must be a non-null object", {}, executionId);
    }

    // Forbidden Fields
    for (const key of Object.keys(input)) {
        if (FORBIDDEN_FIELDS.includes(key)) {
            return buildError(input, "FORBIDDEN_FIELD", `Field '${key}' is strictly forbidden.`, { field: key }, executionId);
        }
    }

    // Phase Check
    if (input.phase !== PHASE_ID) {
        return buildError(input, "INVALID_INPUT", `Invalid phase: expected '${PHASE_ID}', got '${input.phase}'`, {}, executionId);
    }

    // Feature Flags
    if (!input.feature_flags) {
        return buildError(input, "INVALID_INPUT", "Missing feature_flags", {}, executionId);
    }

    // Tenant
    if (!input.tenant_context || typeof input.tenant_context.tenant_id !== "string") {
        return buildError(input, "INVALID_INPUT", "Missing or invalid tenant_context", {}, executionId);
    }

    // Upstream Dependencies
    if (!input.capability_surface || typeof input.capability_surface !== "object") {
        return buildError(input, "MISSING_DEPENDENCY", "Missing capability_surface", {}, executionId);
    }
    if (!input.routing_profile || typeof input.routing_profile !== "object") {
        return buildError(input, "MISSING_DEPENDENCY", "Missing routing_profile", {}, executionId);
    }
    if (!input.response_normalizer_spec || typeof input.response_normalizer_spec !== "object") {
        return buildError(input, "MISSING_DEPENDENCY", "Missing response_normalizer_spec", {}, executionId);
    }
    if (!input.error_resolver_spec || typeof input.error_resolver_spec !== "object") {
        return buildError(input, "MISSING_DEPENDENCY", "Missing error_resolver_spec", {}, executionId);
    }

    return null;
}

// -----------------------------------------------------------------------------
// Hashing (TP1 Strict Canonical)
// -----------------------------------------------------------------------------

function computeCanonicalHash(obj) {
    const canonical = canonicalizeForHash(obj);
    const json = JSON.stringify(canonical);
    return crypto.createHash("sha256").update(json).digest("hex");
}

function canonicalizeForHash(value) {
    if (value === null || typeof value !== "object") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(canonicalizeForHash);
    }

    const out = {};
    for (const key of Object.keys(value).sort()) {
        out[key] = canonicalizeForHash(value[key]);
    }
    return out;
}

function sortObjectKeys(obj) {
    const out = {};
    Object.keys(obj).sort().forEach(key => {
        out[key] = obj[key];
    });
    return out;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeExecutionId(input) {
    return (input && typeof input.execution_id === "string") ? input.execution_id : "unknown-exec-id";
}

function buildError(input, code, message, details = {}, forceExecId = null) {
    return {
        status: "ERROR",
        execution_id: forceExecId || safeExecutionId(input),
        phase: PHASE_ID,
        errors: [{ code, message, details }]
    };
}

function buildNoOpResponse(executionId) {
    return {
        status: "NO_OP",
        execution_id: executionId,
        phase: PHASE_ID
    };
}

// -----------------------------------------------------------------------------
// Observability Helpers
// -----------------------------------------------------------------------------

function logEvent(status, executionId) {
    logStructured("pib_tiktok_phase_9_event", {
        execution_id: executionId,
        status: status
    });
}

function recordMetrics(type, input) {
    if (type === "processed") metrics.count("pib_tiktok_phase_9_processed", 1);
    if (type === "error") metrics.count("pib_tiktok_phase_9_error", 1);
    if (type === "crash") metrics.count("pib_tiktok_phase_9_crash", 1);
    if (type === "disabled") metrics.count("pib_tiktok_phase_9_disabled", 1);
}

module.exports = { execute };
