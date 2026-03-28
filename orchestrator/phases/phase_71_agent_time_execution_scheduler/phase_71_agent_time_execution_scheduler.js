const { logStructured } = require('../../shared/logging');
const metrics = require('../../shared/metrics');
const { startSpan } = require('../../shared/tracing');

const PHASE_ID = '71';
const FEATURE_FLAG = 'FF_AGENT_TIME_EXECUTION_SCHEDULER';
const SCHEDULER_VERSION = 'agent_time_execution_scheduler_v1';

// Validation Helper
function isSafeType(value) {
    if (value === null) return true;
    if (value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (value instanceof Date) return false;
    if (Array.isArray(value)) return value.every(isSafeType);
    if (typeof value === 'object') return Object.values(value).every(isSafeType);
    return false;
}

function validateInput(input) {
    const violations = [];
    if (!input || typeof input !== 'object') {
        return [{ code: 'INVALID_INPUT', message: 'Input must be an object' }];
    }

    // Feature Flag Check (Phase ID)
    if (input.phase !== PHASE_ID) violations.push({ code: 'INVALID_PHASE', message: `Expected phase ${PHASE_ID}` });

    // 1.2.3 Feature Flag Input Check
    if (!input.feature_flags || input.feature_flags[FEATURE_FLAG] !== true) {
        violations.push({ code: 'FEATURE_FLAG_REQUIRED', path: `feature_flags.${FEATURE_FLAG}`, message: 'Feature flag must be true' });
    }

    // 1.2.1 Execution ID Check
    if (typeof input.execution_id !== 'string' || input.execution_id.trim().length === 0) {
        violations.push({ code: 'INVALID_EXECUTION_ID', path: 'execution_id', message: 'execution_id must be a non-empty string' });
    }

    // 1.2.2 Rate Limit Snapshot Check
    if (!input.rate_limit_snapshot || typeof input.rate_limit_snapshot !== 'object') {
        violations.push({ code: 'MISSING_RATE_LIMIT_SNAPSHOT', path: 'rate_limit_snapshot', message: 'rate_limit_snapshot is required' });
    }

    // Time Window
    if (!input.time_window) {
        violations.push({ code: 'MISSING_TIME_WINDOW', message: 'time_window required' });
    } else {
        const { start_logical_time, end_logical_time, slice_ms } = input.time_window;
        if (typeof start_logical_time !== 'number' || typeof end_logical_time !== 'number' || typeof slice_ms !== 'number') {
            violations.push({ code: 'INVALID_TIME_TYPES', message: 'Time fields must be numbers' });
        } else {
            if (end_logical_time <= start_logical_time) violations.push({ code: 'INVALID_TIME_WINDOW', message: 'end_logical_time must be > start_logical_time' });
            if (slice_ms <= 0) violations.push({ code: 'INVALID_SLICE_MS', message: 'slice_ms must be positive' });
            const duration = end_logical_time - start_logical_time;
            if (duration > 0 && duration >= slice_ms && duration % slice_ms !== 0) {
                violations.push({ code: 'NON_INTEGER_SLICE_COUNT', message: 'Window duration must be divisible by slice_ms' });
            }
        }
    }

    // Scheduler Config
    if (!input.scheduler_config) {
        violations.push({ code: 'MISSING_CONFIG', message: 'scheduler_config required' });
    } else {
        if (input.scheduler_config.max_total_slices <= 0) violations.push({ code: 'INVALID_MAX_SLICES', message: 'max_total_slices must be positive' });
        if (!['WEIGHTED_ROUND_ROBIN', 'STRICT_PRIORITY'].includes(input.scheduler_config.fairness_mode)) {
            violations.push({ code: 'INVALID_FAIRNESS_MODE', message: 'Invalid fairness mode' });
        }
    }

    // Tenant / Agent Integrity
    if (input.agent_queue && input.tenant_context) {
        for (const [reqId, req] of Object.entries(input.agent_queue)) {
            if (!input.tenant_context[req.tenant_id]) {
                violations.push({ code: 'UNKNOWN_TENANT_ID', message: `Request ${reqId} refers to unknown tenant ${req.tenant_id}` });
            }
        }
    }

    // Type Safety Scan
    if (!isSafeType(input)) {
        violations.push({ code: 'NON_SERIALIZABLE_TYPE', message: 'Input contains forbidden types (Date, Function, Undefined)' });
    }

    return violations;
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function execute(input) {
    // 1. Start Observability
    const span = startSpan('phase_71_agent_time_execution_scheduler', {
        execution_id: input?.execution_id,
        phase: PHASE_ID
    });

    try {
        // 1.3 Env + Input Flag Enforcement
        const envEnabled = process.env.FF_AGENT_TIME_EXECUTION_SCHEDULER === 'true';
        const inputEnabled = !!(input?.feature_flags?.[FEATURE_FLAG]);

        if (!envEnabled || !inputEnabled) {
            metrics.count(`phase_${PHASE_ID}.schedule.invocations`, 1, { status: 'FEATURE_DISABLED' });
            return {
                ok: false,
                status: 'FEATURE_DISABLED',
                execution_id: input?.execution_id,
                phase: PHASE_ID,
                feature_flags: input?.feature_flags || {}
            };
        }

        // 3. Validation
        const violations = validateInput(input);
        if (violations.length > 0) {
            metrics.count(`phase_${PHASE_ID}.schedule.invocations`, 1, { status: 'VALIDATION_FAILED' });
            return {
                ok: false,
                status: 'VALIDATION_FAILED',
                execution_id: input.execution_id,
                phase: PHASE_ID,
                violations
            };
        }

        // 4. Setup
        const { time_window, scheduler_config, tenant_context, agent_queue, prior_schedule_state } = input;

        // Calculate Slices
        const rawTotalSlices = Math.floor((time_window.end_logical_time - time_window.start_logical_time) / time_window.slice_ms);
        const totalSlices = Math.min(rawTotalSlices, scheduler_config.max_total_slices);

        let scheduledSlots = [];
        let unscheduledRequests = [];

        // Candidate Filtering & Queue Prep
        const queueEntries = Object.entries(agent_queue || {});

        // If no agents
        if (queueEntries.length === 0) {
            const result = {
                ok: true,
                status: 'NO_ELIGIBLE_AGENTS',
                execution_id: input.execution_id,
                phase: PHASE_ID,
                feature_flags: input.feature_flags,
                scheduler_version: SCHEDULER_VERSION,
                time_window: { ...time_window, total_slices: totalSlices },
                scheduled_slots: [],
                unscheduled_requests: [],
                fairness_summary: { mode: scheduler_config.fairness_mode, tenants: {}, global: { total_slots: totalSlices, total_requests: 0, total_scheduled_requests: 0 } },
                rate_limit_snapshot_out: input.rate_limit_snapshot || {},
                violations: [],
                diagnostics: { input_agent_count: 0, slices_available: totalSlices, slices_assigned: 0 }
            };
            metrics.count(`phase_${PHASE_ID}.schedule.invocations`, 1, { status: 'NO_ELIGIBLE_AGENTS' });
            return result;
        }

        // 4.1 NO_SLOTS_AVAILABLE check
        if (totalSlices === 0 && queueEntries.length > 0) {
            const result = {
                ok: true,
                status: 'NO_SLOTS_AVAILABLE',
                execution_id: input.execution_id,
                phase: PHASE_ID,
                feature_flags: input.feature_flags,
                scheduler_version: SCHEDULER_VERSION,
                time_window: { ...time_window, total_slices: 0 },
                scheduled_slots: [],
                unscheduled_requests: [],
                fairness_summary: { mode: scheduler_config.fairness_mode, tenants: {}, global: { total_slots: 0, total_requests: queueEntries.length, total_scheduled_requests: 0 } },
                rate_limit_snapshot_out: input.rate_limit_snapshot || {},
                violations: [],
                diagnostics: { input_agent_count: queueEntries.length, slices_available: 0, slices_assigned: 0 }
            };
            metrics.count(`phase_${PHASE_ID}.schedule.invocations`, 1, { status: 'NO_SLOTS_AVAILABLE' });
            return result;
        }

        // Determine effective weights and quotas
        const tenantIds = Object.keys(tenant_context);
        const defaults = {
            weight: scheduler_config.default_tenant_weight || 1.0,
            priority: scheduler_config.default_tenant_priority || 1
        };

        const activeTenants = {};
        let totalWeight = 0;

        tenantIds.forEach(tid => {
            const ctx = tenant_context[tid];
            const weight = (typeof ctx.weight === 'number') ? ctx.weight : defaults.weight;
            if (weight > 0) totalWeight += weight;
            activeTenants[tid] = {
                id: tid,
                weight,
                priority: (typeof ctx.priority === 'number') ? ctx.priority : defaults.priority,
                max_slices: (typeof ctx.max_slices_per_window === 'number') ? ctx.max_slices_per_window : scheduler_config.max_total_slices,
                used_slices: 0,
                requests: []
            };
        });

        // Quota Allocation
        tenantIds.forEach(tid => {
            const t = activeTenants[tid];
            if (totalWeight > 0) {
                t.ideal_quota = Math.floor(totalSlices * (t.weight / totalWeight));
            } else {
                t.ideal_quota = 0;
            }

            // Adjust for prior state
            const priorUsed = prior_schedule_state?.tenant_slices?.[tid] || 0;
            const cap = Math.min(t.max_slices, t.ideal_quota, scheduler_config.max_total_slices);
            t.remaining_quota = Math.max(0, cap - priorUsed);
        });

        // Filter and Enqueue Requests
        const validRequests = [];
        queueEntries.forEach(([reqId, req]) => {
            // Deadline Check
            if (req.deadline_at) {
                const deadline = Date.parse(req.deadline_at);
                if (deadline < time_window.start_logical_time) return; // Expired
            }

            // Prior Usage Check
            const priorReqUsed = prior_schedule_state?.request_slices?.[reqId] || 0;
            if (priorReqUsed >= (scheduler_config.max_slices_per_request || Infinity)) {
                unscheduledRequests.push({
                    agent_request_id: reqId,
                    tenant_id: req.tenant_id,
                    reason_code: 'MAX_SLICES_PER_REQUEST_REACHED',
                    next_eligible_time: time_window.end_logical_time
                });
                return;
            }

            // Valid candidate
            const enriched = {
                ...req,
                reqId,
                slices_used_in_window: 0,
                prior_slices: priorReqUsed
            };
            validRequests.push(enriched);
            if (activeTenants[req.tenant_id]) {
                activeTenants[req.tenant_id].requests.push(enriched);
            }
        });

        // Sorting Logic based on Mode
        const mode = scheduler_config.fairness_mode;

        // Rate Limits Tracking (Immutable input, so clone snapshot)
        // 1.1 Move to top-level
        const rateLimitSnapshot = deepClone(input.rate_limit_snapshot || {});
        // Ensure keys exist
        tenantIds.forEach(tid => {
            if (!rateLimitSnapshot[tid]) rateLimitSnapshot[tid] = { per_minute_used: 0, per_hour_used: 0 };
        });

        // --- SCHEDULING ---

        if (mode === 'WEIGHTED_ROUND_ROBIN') {
            // Sort tenants: Priority DESC, ID ASC
            const sortedTenants = Object.values(activeTenants).sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority;
                return a.id.localeCompare(b.id);
            });

            // Iterate Slots
            for (let slotIdx = 0; slotIdx < totalSlices; slotIdx++) {
                const slotStart = time_window.start_logical_time + (slotIdx * time_window.slice_ms);
                const slotEnd = slotStart + time_window.slice_ms;

                let slotFilled = false;

                // Round Robin through Tenants
                for (const tenant of sortedTenants) {
                    if (slotFilled) break;
                    if (tenant.remaining_quota <= 0) continue;
                    if (tenant.requests.length === 0) continue;

                    // 2.1 WRR Queue Scan Logic
                    const maxReqLimit = scheduler_config.max_slices_per_request || Infinity;

                    // Explicit loop strictly as requested
                    for (let attempt = 0; attempt < tenant.requests.length; attempt++) {
                        const req = tenant.requests.shift();

                        // REQ MAXED
                        if ((req.slices_used_in_window + req.prior_slices) >= maxReqLimit) {
                            if (req.slices_used_in_window === 0) {
                                unscheduledRequests.push({
                                    agent_request_id: req.reqId,
                                    tenant_id: req.tenant_id,
                                    reason_code: 'MAX_SLICES_PER_REQUEST_REACHED',
                                    next_eligible_time: time_window.end_logical_time
                                });
                            }
                            continue; // try next request
                        }

                        // RATE LIMIT OR CONCURRENCY FAIL check helper
                        const limits = tenant_context[tenant.id].rate_limits || {};
                        const usage = rateLimitSnapshot[tenant.id];
                        const canSchedule = (req) => {
                            if ((limits.per_minute && usage.per_minute_used >= limits.per_minute) ||
                                (limits.per_hour && usage.per_hour_used >= limits.per_hour)) {
                                return false; // RATE_LIMIT_EXCEEDED
                            }
                            return true;
                        };

                        if (!canSchedule(req)) {
                            tenant.requests.push(req);
                            continue;
                        }

                        // SUCCESS → schedule and break

                        scheduledSlots.push({
                            slot_index: slotIdx,
                            start_logical_time: slotStart,
                            end_logical_time: slotEnd,
                            tenant_id: tenant.id,
                            agent_id: req.agent_id,
                            agent_request_id: req.reqId,
                            priority: req.priority,
                            fairness_bucket: tenant.id,
                            reason_codes: ['SCHEDULED_OK'],
                            requested_connectors: req.requested_connectors,
                            estimated_cost_units: req.estimated_cost_units
                        });

                        // Update Usage
                        tenant.remaining_quota--;
                        tenant.used_slices++;
                        req.slices_used_in_window++;

                        // Rate Limit Update
                        usage.per_minute_used++;
                        usage.per_hour_used++;

                        // Re-queue valid request for future slots
                        tenant.requests.push(req);

                        slotFilled = true;
                        break;
                    }
                }
            }

        } else if (mode === 'STRICT_PRIORITY') {
            // Sort ALL requests
            validRequests.sort((a, b) => {
                // tenant.priority (desc)
                const pA = activeTenants[a.tenant_id].priority;
                const pB = activeTenants[b.tenant_id].priority;
                if (pA !== pB) return pB - pA;

                // req.priority (desc)
                if (a.priority !== b.priority) return b.priority - a.priority;

                // requested_at (asc) (string compare or time?) Spec: "ISO string numeric"
                const tA = Date.parse(a.requested_at);
                const tB = Date.parse(b.requested_at);
                if (tA !== tB) return tA - tB;

                // tenant_id (asc)
                if (a.tenant_id !== b.tenant_id) return a.tenant_id.localeCompare(b.tenant_id);

                // agent_id (asc) ...
                if (a.agent_id !== b.agent_id) return a.agent_id.localeCompare(b.agent_id);

                // request_id (asc)
                return a.reqId.localeCompare(b.reqId);
            });

            // Iterate Slots
            for (let slotIdx = 0; slotIdx < totalSlices; slotIdx++) {
                const slotStart = time_window.start_logical_time + (slotIdx * time_window.slice_ms);
                const slotEnd = slotStart + time_window.slice_ms;

                // Find first eligible request in sorted list
                for (let i = 0; i < validRequests.length; i++) {
                    const req = validRequests[i];
                    const tenant = activeTenants[req.tenant_id];

                    if (tenant.remaining_quota <= 0) continue;

                    const usage = rateLimitSnapshot[tenant.id];
                    const limits = tenant_context[tenant.id].rate_limits || {};

                    if ((limits.per_minute && usage.per_minute_used >= limits.per_minute) ||
                        (limits.per_hour && usage.per_hour_used >= limits.per_hour)) {
                        continue;
                    }

                    const maxReq = scheduler_config.max_slices_per_request || Infinity;
                    if ((req.slices_used_in_window + req.prior_slices) >= maxReq) {
                        continue;
                    }

                    // Assign
                    scheduledSlots.push({
                        slot_index: slotIdx,
                        start_logical_time: slotStart,
                        end_logical_time: slotEnd,
                        tenant_id: tenant.id,
                        agent_id: req.agent_id,
                        agent_request_id: req.reqId,
                        priority: req.priority,
                        fairness_bucket: tenant.id,
                        reason_codes: ['SCHEDULED_OK'],
                        requested_connectors: req.requested_connectors,
                        estimated_cost_units: req.estimated_cost_units
                    });

                    tenant.remaining_quota--;
                    tenant.used_slices++;
                    req.slices_used_in_window++;
                    usage.per_minute_used++;
                    usage.per_hour_used++;

                    break; // Slot Filled
                }
            }
        }

        // Post-Processing: Unscheduled Requests
        validRequests.forEach(req => {
            if (req.slices_used_in_window === 0) {
                let code = 'NO_SLOTS_AVAILABLE'; // Default
                const tenant = activeTenants[req.tenant_id];

                // Check specific conditions
                if (tenant.weight === 0) {
                    code = 'NO_TENANT_WEIGHT';
                } else if (tenant.max_slices === 0 || (tenant.ideal_quota === 0 && tenant.remaining_quota === 0)) {
                    // Distinction between Configured Max 0 vs Calculated Quota 0
                    if (tenant_context[req.tenant_id].max_slices_per_window === 0) code = 'TENANT_QUOTA_EXHAUSTED';
                }

                // Rate Limits?
                const limits = tenant_context[req.tenant_id].rate_limits || {};
                const usage = rateLimitSnapshot[req.tenant_id]; // Baseline start
                if ((limits.per_minute && usage.per_minute_used >= limits.per_minute)) code = 'RATE_LIMIT_EXCEEDED';

                // Was it maxed from prior?
                if (req.prior_slices >= (scheduler_config.max_slices_per_request || Infinity)) code = 'MAX_SLICES_PER_REQUEST_REACHED';

                // Add to unscheduled if not already there (from max slice logic)
                const exists = unscheduledRequests.find(u => u.agent_request_id === req.reqId);
                if (!exists) {
                    unscheduledRequests.push({
                        agent_request_id: req.reqId,
                        tenant_id: req.tenant_id,
                        reason_code: code,
                        next_eligible_time: time_window.end_logical_time
                    });
                }
            }
        });

        // Sort Unscheduled
        unscheduledRequests.sort((a, b) => {
            if (a.tenant_id !== b.tenant_id) return a.tenant_id.localeCompare(b.tenant_id);
            return a.agent_request_id.localeCompare(b.agent_request_id);
        });

        // Diagnostics & Summary
        const fairnessSummary = {
            mode,
            tenants: {},
            global: {
                total_slots: totalSlices,
                total_requests: queueEntries.length,
                total_scheduled_requests: queueEntries.length - unscheduledRequests.length,
                total_unscheduled_requests: unscheduledRequests.length
            }
        };

        Object.values(activeTenants).forEach(t => {
            fairnessSummary.tenants[t.id] = {
                weight: t.weight,
                priority: t.priority,
                requested_slices: t.ideal_quota, // 3.1 Fix
                allocated_slices: t.used_slices,
                share_ratio: totalSlices > 0 ? (t.used_slices / totalSlices) : 0,
                violated_limits: []
            };
        });

        // Metrics
        metrics.count(`phase_${PHASE_ID}.schedule.invocations`, 1, { status: 'OK' });
        metrics.gauge(`phase_${PHASE_ID}.schedule.scheduled_slots`, scheduledSlots.length, { status: 'OK' });
        metrics.gauge(`phase_${PHASE_ID}.schedule.unscheduled_requests`, unscheduledRequests.length, { status: 'OK' });

        logStructured('phase_71_agent_time_execution_scheduler_result', {
            execution_id: input.execution_id,
            phase: PHASE_ID,
            status: 'OK',
            ok: true,
            scheduled_slots: scheduledSlots.length,
            unscheduled_requests: unscheduledRequests.length,
            fairness_mode: mode
        });

        return {
            ok: true,
            status: 'OK',
            execution_id: input.execution_id,
            phase: PHASE_ID,
            feature_flags: input.feature_flags,
            scheduler_version: SCHEDULER_VERSION,
            time_window: { ...time_window, total_slices: totalSlices },
            scheduled_slots: scheduledSlots,
            unscheduled_requests: unscheduledRequests,
            fairness_summary: fairnessSummary,
            rate_limit_snapshot_out: rateLimitSnapshot, // Updated during loop
            violations: [],
            diagnostics: {
                input_agent_count: queueEntries.length,
                input_tenant_count: tenantIds.length,
                slices_available: totalSlices,
                slices_assigned: scheduledSlots.length,
                slices_unassigned: totalSlices - scheduledSlots.length
            }
        };

    } catch (err) {
        logStructured('phase_71_error', { error: err.message, stack: err.stack });
        metrics.count(`phase_${PHASE_ID}.schedule.error`, 1);
        throw err;
    } finally {
        span.end();
    }
}

module.exports = { execute };
