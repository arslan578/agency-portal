# Phase 58: Safety Horizon Evaluator Specification

**Contract Name:** `connector_safety_horizon_v1`
**Feature Flag:** `FF_SAFETY_HORIZON_EVALUATOR` (Default: `false`)
**Mode:** Pure Logic (No IO)

## 1. Purpose
Phase 58 takes the output of Phase 57 (Global Connector State Merger) and computes Kaivo’s safety horizon. It acts as a firewall between surveillance and action generation, determining which connectors are safe to execute, which are degraded, and what the maximum allowable execution horizon is.

## 2. Inputs (`connector_state_horizon_input_v1`)

```json
{
  "execution_id": "exec_123",
  "phase": "58",
  "feature_flags": {
    "FF_SAFETY_HORIZON_EVALUATOR": true
  },
  "merged_connector_state": {
    "meta_ads": {
      "state": "HEALTHY",
      "drift_markers": [],
      "capabilities": { "CAP_READ": true },
      "failure_patterns": [],
      "readiness": "READY",
      "retry_history": { "exhausted": false }
    }
  }
}
```

**Constraints:**
*   `execution_id` is required.
*   `merged_connector_state` is required.
*   **Strict Input Whitelist:** Only `execution_id`, `phase`, `feature_flags`, and `merged_connector_state` are allowed. Unknown fields produce `INVALID_INPUT`.
*   **Capabilities Required:** Capabilities object is required for every connector. If any entry in `merged_connector_state` is missing a capabilities object, Phase 58 returns status: `INVALID_INPUT`.

## 3. Outputs (`connector_safety_horizon_output_v1`)

```json
{
  "execution_id": "exec_123",
  "phase": "58",
  "status": "OK",
  "feature_flag_enabled": true,
  "safety_zone": {
    "meta_ads": "STABLE"
  },
  "safe_execution_horizon": 5,
  "redundancy_profile": {
    "meta_ads": {
      "redundancy_level": "none",
      "substitutes": []
    }
  },
  "forbidden_actions": [],
  "risk_ledger": {
    "meta_ads": 0.0
  },
  "snapshot": { ... }
}
```

**Status Codes:**
*   `OK`: Successful evaluation.
*   `FEATURE_DISABLED`: Feature flag is off.
*   `INVALID_INPUT`: Missing required fields or malformed input.

## 4. Behavior Requirements

### 4.1 Risk Ledger Calculation
For each connector:
*   **Base Risk:** `capability.integrity_score` (default 0.0 if missing).
*   **Drift Multiplier:**
    *   No drift: 1.0
    *   Minor drift: 1.2
    *   Major drift: 1.5
*   **Failure Pattern Multiplier:** 1.0 + (0.1 * count of failure patterns).
*   **Retry Exhaustion:** If `retry_history.exhausted` is true, set risk to strictly `HIGH` (e.g., 10.0) regardless of multipliers.

### 4.2 Forbidden Actions
An action (connector execution) is forbidden if:
*   Connector Risk > 5.0 (Upper Safety Bound).
*   Capability `allows_execution` is explicitly `false`.
*   `retry_history.exhausted` is `true`.
*   Drift classification is `UNRECOVERABLE`.
*   Connector state is `OFFLINE` or `ERROR`.

### 4.3 Safety Zone Computation
*   `EMERGENCY_ONLY`: `retry_history.exhausted` is `true` AND state is `ERROR`.
*   `UNSAFE`: Risk >= 5.0, Error state, or major drift.
*   `DEGRADED`: Risk < 5.0, Degraded state or minor drift.
*   `STABLE`: Healthy state (Risk < 2.0 implied).

### 4.4 Redundancy Profile
*   Derived from `capabilities.shared_group`.
*   **Logic:**
    *   Group size 1 or no group: `none`.
    *   Group size 2: `low`.
    *   Group size 3-4: `moderate`.
    *   Group size 5+: `high`.
*   `substitutes`: List of other connectors in the same group, sorted lexicographically.

### 4.5 Safe Execution Horizon
*   Integer representing max safe depth.
*   Base: 10.
*   Subtract 1 for every `DEGRADED` connector.
*   Subtract 5 for every `UNSAFE` connector.
*   Min: 0.

### 4.6 Feature Flag
*   Enabled ONLY when `process.env.FF_SAFETY_HORIZON_EVALUATOR === 'true'` AND `feature_flags.FF_SAFETY_HORIZON_EVALUATOR === true`.
*   Otherwise:
    *   Return `status: "FEATURE_DISABLED"`
    *   `feature_flag_enabled: false`
    *   Empty/Zero values for all other fields.

### 4.7 Determinism
*   **Sorting:** All connector IDs and lists must be sorted lexicographically.
*   **Immutability:** Inputs must be deep cloned.
*   **Snapshot:** Deterministic JSON representation of the safety state, including `safe_execution_horizon`.

## 5. Observability
*   **Metrics:**
    *   `phase_58.invoked` (Counter)
    *   `phase_58.risk_max` (Gauge)
*   **Logs:** `phase_58_safety_horizon_evaluator` (Structured, includes `max_risk`, `safe_execution_horizon`, `forbidden_count`)
*   **Trace:** `phase_58_horizon_evaluator`
