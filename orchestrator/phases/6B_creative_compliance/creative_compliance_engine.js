/**
 * Phase 6B: Creative Compliance & Platform Policy Evaluator
 * 
 * Provides the first policy firewall in the pipeline.
 * Evaluates creative compliance deterministically using:
 * - Policy Mirror (Phase 32)
 * - Creative Compliance Inference Layer (Phase 33)
 * - Creative AI scoring modules (Phase 3)
 * 
 * Contract: creative_compliance_eval_v1
 * Feature Flag: FF_CREATIVE_COMPLIANCE_EVAL
 */

const crypto = require('crypto');

/**
 * Deep clone an object to prevent mutation (Framework Rule #1)
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Compute deterministic hash for observability
 */
function computeDeterministicHash(data) {
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

/**
 * Mock: Policy Mirror integration (Phase 32)
 * In production, this would call the actual Policy Mirror service
 */
async function resolvePlatformPolicy(platform_key, tenant_id, workspace_id) {
    // Mock policy rules for different platforms
    const mockPolicies = {
        google: {
            max_headline_length: 30,
            max_description_length: 90,
            max_body_text_length: 5000,
            allowed_languages: ['en', 'es', 'fr', 'de', 'ja', 'zh']
        },
        meta: {
            max_headline_length: 40,
            max_description_length: 125,
            max_body_text_length: 125,
            allowed_languages: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt']
        },
        tiktok: {
            max_headline_length: 100,
            max_description_length: 100,
            max_body_text_length: 100,
            allowed_languages: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'ko']
        },
        youtube: {
            max_headline_length: 100,
            max_description_length: 5000,
            max_body_text_length: 5000,
            allowed_languages: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'ko', 'pt', 'ru']
        },
        reddit: {
            max_headline_length: 300,
            max_description_length: 300,
            max_body_text_length: 40000,
            allowed_languages: ['en']
        }
    };

    return mockPolicies[platform_key] || mockPolicies.google;
}

/**
 * Mock: Creative Compliance Inference Layer (Phase 33)
 * In production, this would call the actual ML inference service
 */
async function runComplianceInference(creative, platform_key) {
    // Mock ML signals - always pass for now
    return {
        status: 'PASS',
        confidence: 0.95,
        signals: []
    };
}

/**
 * Evaluate a single creative against a platform's policy
 */
async function evaluateCreativeForPlatform(creative, platform_key, policy, tenant_id, workspace_id, inferenceEngine) {
    const reasons = [];
    let status = 'PASS';

    // Check creative_type support
    const supportedTypes = ['VIDEO', 'IMAGE', 'TEXT'];
    if (!supportedTypes.includes(creative.creative_type)) {
        reasons.push(`Unsupported creative type: ${creative.creative_type}`);
        return {
            status: 'FAIL',
            reasons,
            error_code: 'UNSUPPORTED_MEDIA_TYPE'
        };
    }

    // Check language support
    if (creative.language && policy.allowed_languages && !policy.allowed_languages.includes(creative.language)) {
        reasons.push(`Language '${creative.language}' not supported by ${platform_key}`);
        status = 'WARN';
    }

    // Check headline length
    if (creative.headline && creative.headline.length > policy.max_headline_length) {
        reasons.push(`Headline exceeds ${platform_key} limit (${creative.headline.length} > ${policy.max_headline_length} chars)`);
        status = status === 'FAIL' ? 'FAIL' : 'WARN';
    }

    // Check body text length
    if (creative.body_text && creative.body_text.length > policy.max_body_text_length) {
        reasons.push(`Body text exceeds ${platform_key} limit (${creative.body_text.length} > ${policy.max_body_text_length} chars)`);
        status = status === 'FAIL' ? 'FAIL' : 'WARN';
    }

    // Check video duration (if applicable)
    if (creative.creative_type === 'VIDEO' && creative.duration_ms) {
        if (creative.duration_ms > 600000) { // 10 minutes
            reasons.push(`Video duration exceeds ${platform_key} recommended limit`);
            status = status === 'FAIL' ? 'FAIL' : 'WARN';
        }
    }

    // Run ML inference (injected)
    const mlResult = await inferenceEngine(creative, platform_key);
    if (mlResult.status === 'FAIL') {
        reasons.push(...mlResult.signals);
        status = 'FAIL';
    } else if (mlResult.status === 'WARN' && status === 'PASS') {
        reasons.push(...mlResult.signals);
        status = 'WARN';
    }

    return { status, reasons };
}

/**
 * Generate deterministic suggested fixes based on findings
 */
function generateSuggestedFixes(creative, platform_findings) {
    const fixes = [];

    for (const [platform, finding] of Object.entries(platform_findings)) {
        for (const reason of finding.reasons) {
            if (reason.includes('Headline exceeds')) {
                fixes.push(`Shorten headline to meet ${platform} requirements`);
            }
            if (reason.includes('Body text exceeds')) {
                fixes.push(`Shorten body_text to meet ${platform} requirements`);
            }
            if (reason.includes('Language')) {
                fixes.push(`Change language or exclude ${platform} from targeting`);
            }
            if (reason.includes('Video duration')) {
                fixes.push(`Reduce video duration to under 10 minutes`);
            }
        }
    }

    // Return unique, sorted fixes
    return [...new Set(fixes)].sort();
}

/**
 * Determine overall creative status from platform findings
 */
function aggregateCreativeStatus(platform_findings) {
    let hasWarn = false;
    let hasFail = false;

    for (const finding of Object.values(platform_findings)) {
        if (finding.status === 'FAIL') hasFail = true;
        if (finding.status === 'WARN') hasWarn = true;
    }

    if (hasFail) return 'FAIL';
    if (hasWarn) return 'WARN';
    return 'PASS';
}

/**
 * Main evaluation function
 * 
 * @param {object} input - Input contract creative_compliance_v1
 * @param {object} context - Optional context (for testing/injection)
 * @returns {Promise<object>} - creative_compliance_report_v1
 */
async function evaluateCreativeCompliance(input, context = {}) {
    const timestamp = new Date().toISOString();

    // Feature flag check
    const FF_CREATIVE_COMPLIANCE_EVAL = process.env.FF_CREATIVE_COMPLIANCE_EVAL === 'true';

    if (!FF_CREATIVE_COMPLIANCE_EVAL) {
        return {
            ok: true,
            module: 'creative_compliance_engine',
            timestamp,
            payload: {
                execution_id: input?.execution_id || 'unknown',
                overall_status: 'PASS',
                creatives: {},
                metrics: {
                    total_creatives: 0,
                    pass_count: 0,
                    warn_count: 0,
                    fail_count: 0
                }
            }
        };
    }

    // Input validation
    if (!input || typeof input !== 'object') {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'INVALID_INPUT',
                message: 'Input must be an object'
            }
        };
    }

    if (!input.execution_id || typeof input.execution_id !== 'string') {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'INVALID_INPUT',
                message: 'Missing or invalid execution_id'
            }
        };
    }

    if (!input.creatives || typeof input.creatives !== 'object') {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'INVALID_INPUT',
                message: 'Missing or invalid creatives'
            }
        };
    }

    if (!input.policy_context || typeof input.policy_context !== 'object') {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'INVALID_INPUT',
                message: 'Missing or invalid policy_context'
            }
        };
    }

    const creative_ids = Object.keys(input.creatives);
    if (creative_ids.length === 0) {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'INVALID_INPUT',
                message: 'Creatives object must not be empty'
            }
        };
    }

    // Deep clone to prevent mutation (Framework Rule #1)
    const creatives_clone = deepClone(input.creatives);

    // Resolve dependencies, with support for injection
    const policyResolver = context.policyResolver || resolvePlatformPolicy;
    const inferenceEngine = context.inferenceEngine || runComplianceInference;

    try {
        const { tenant_id, workspace_id, platforms } = input.policy_context;

        // Sort creative IDs deterministically
        const sorted_creative_ids = creative_ids.sort();

        // Sort platform keys deterministically
        const sorted_platforms = (platforms || ['google', 'meta']).sort();

        const evaluated_creatives = {};
        let pass_count = 0;
        let warn_count = 0;
        let fail_count = 0;

        // Evaluate each creative
        for (const creative_id of sorted_creative_ids) {
            const creative = creatives_clone[creative_id];

            // Validate required creative fields
            if (!creative.creative_type || !creative.language) {
                return {
                    ok: false,
                    module: 'creative_compliance_engine',
                    timestamp,
                    payload: null,
                    error: {
                        code: 'INVALID_INPUT',
                        message: `Creative ${creative_id} missing required fields: creative_type, language`
                    }
                };
            }

            const platform_findings = {};

            // Evaluate against each platform
            for (const platform_key of sorted_platforms) {
                try {
                    const policy = await policyResolver(platform_key, tenant_id, workspace_id);
                    const finding = await evaluateCreativeForPlatform(
                        creative,
                        platform_key,
                        policy,
                        tenant_id,
                        workspace_id,
                        inferenceEngine
                    );

                    platform_findings[platform_key] = {
                        status: finding.status,
                        reasons: finding.reasons.sort(), // Deterministic ordering
                        // Propagate structured error_code if present
                        ...(finding.error_code ? { error_code: finding.error_code } : {})
                    };
                } catch (error) {
                    return {
                        ok: false,
                        module: 'creative_compliance_engine',
                        timestamp,
                        payload: null,
                        error: {
                            code: 'KNOWLEDGE_RESOLUTION_FAILURE',
                            message: `Failed to resolve policy for ${platform_key}: ${error.message}`
                        }
                    };
                }
            }

            // Aggregate creative status
            const creative_status = aggregateCreativeStatus(platform_findings);

            // Generate suggested fixes
            const suggested_fixes = generateSuggestedFixes(creative, platform_findings);

            // Collect all reasons (sorted, deduplicated)
            const all_reasons = [];
            for (const finding of Object.values(platform_findings)) {
                all_reasons.push(...finding.reasons);
            }
            const unique_reasons = [...new Set(all_reasons)].sort();

            evaluated_creatives[creative_id] = {
                status: creative_status,
                reasons: unique_reasons,
                platform_findings,
                suggested_fixes
            };

            // Update counts
            if (creative_status === 'PASS') pass_count++;
            else if (creative_status === 'WARN') warn_count++;
            else if (creative_status === 'FAIL') fail_count++;
        }

        // Determine overall status
        let overall_status = 'PASS';
        if (fail_count > 0) overall_status = 'FAIL';
        else if (warn_count > 0) overall_status = 'WARN';

        const report = {
            execution_id: input.execution_id,
            overall_status,
            creatives: evaluated_creatives,
            metrics: {
                total_creatives: creative_ids.length,
                pass_count,
                warn_count,
                fail_count
            }
        };

        // Emit observability hooks (Framework Rule #3)
        emitObservability(input.execution_id, report);

        // Strict mode enforcement
        const strict = process.env.FF_STRICT_CREATIVE_COMPLIANCE === 'true';

        if (strict && overall_status === 'FAIL') {
            return {
                ok: false,
                module: 'creative_compliance_engine',
                timestamp,
                payload: report,
                error: {
                    code: 'POLICY_VIOLATION',
                    fatal: true,
                    message: 'Creative compliance failure in strict mode'
                }
            };
        }

        return {
            ok: true,
            module: 'creative_compliance_engine',
            timestamp,
            payload: report
        };

    } catch (error) {
        return {
            ok: false,
            module: 'creative_compliance_engine',
            timestamp,
            payload: null,
            error: {
                code: 'CREATIVE_UNSCANNABLE',
                message: `Creative evaluation failed: ${error.message}`
            }
        };
    }
}

/**
 * Emit observability signals (Framework Rule #3)
 */
function emitObservability(execution_id, report) {
    // Metric: creative_compliance.scan_completed
    if (process.env.NODE_ENV !== 'test') {
        console.log(JSON.stringify({
            metric: 'creative_compliance.scan_completed',
            execution_id,
            overall_status: report.overall_status,
            total_creatives: report.metrics.total_creatives
        }));
    }

    // Log event
    if (process.env.NODE_ENV !== 'test') {
        console.log(JSON.stringify({
            event: 'creative_compliance_evaluation',
            phase: '6B',
            execution_id,
            overall_status: report.overall_status,
            metrics: report.metrics
        }));
    }

    // Trace span (placeholder - would integrate with OpenTelemetry in production)
    if (process.env.NODE_ENV !== 'test') {
        console.log(JSON.stringify({
            trace_span: 'creative_compliance_eval_v1',
            execution_id,
            status: report.overall_status
        }));
    }
}

module.exports = {
    evaluateCreativeCompliance
};
