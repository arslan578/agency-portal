# Phase 57: Cross Connector State Merger Engine

**Purpose:** Aggregate per connector Phase 56 states into a deterministic global state that includes global health, global drift, capability matrix, routing profile, and a determinism hash. No IO, pure in memory, snapshot safe.

## Contracts

### Input Contract (`global_connector_state_merger_input_contract_v1`)

```typescript
type ConnectorState = {
  auth_state: "VALID" | "INVALID" | "UNKNOWN";
  api_version_state: {
    current_version: string | null;
    target_version: string | null;
  };
  structural_state: {
    needs_rebuild: boolean;
  };
  routing_state?: {
    active_role: "PRIMARY" | "FALLBACK";
    switch_attempted: boolean;
    switched: boolean;
    routing_status?: "STABLE" | "SWITCHED" | "FAILED";
  };
  health_state: "OK" | "DEGRADED" | "BROKEN";
  drift_status: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED";
};

type CapabilitiesForConnector = {
  [capability_key: string]: boolean; // true means connector supports the capability
};

type InputContractV1 = {
  execution_id: string;  // REQUIRED, non-empty
  requested_at?: string; // OPTIONAL, ISO-8601 or omitted
  connector_states_by_key: {        // REQUIRED
    [connector_key: string]: ConnectorState;
  };
  capabilities_by_connector_key?: { // OPTIONAL
    [connector_key: string]: CapabilitiesForConnector;
  };
};
```

**Validation Rules:**
- `execution_id` must be non-empty string.
- `connector_states_by_key` must be object (empty allowed), never null/undefined.
- Top-level allowed fields: `["execution_id", "requested_at", "connector_states_by_key", "capabilities_by_connector_key"]`. Any others -> `INVALID_INPUT`.
- Enums must be strictly validated. No silent defaults.

### Output Contract (`global_connector_state_merger_output_contract_v1`)

```typescript
type RoutingProfile = {
  active_primary_paths: number;
  fallback_dependencies: number;
  degraded_connectors: string[]; // sorted lexicographically
  routing_failures: number;
};

type OutputContractV1 = {
  execution_id: string | null;
  requested_at: string | null;
  global_health: "OK" | "DEGRADED" | "BROKEN" | "UNKNOWN"; // UNKNOWN only in disabled mode
  global_drift: "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED";
  capability_matrix: {
    [capability_key: string]: string[]; // sorted lexicographically
  };
  routing_profile: RoutingProfile;
  merged_state: {
    [connector_key: string]: ConnectorState; // sorted lexicographically
  };
  determinism_hash: string; // lowercase hex sha256 of canonical payload
  feature_flag_enabled: boolean;
  stop_reason: "FEATURE_DISABLED" | "INVALID_INPUT" | "ENGINE_ERROR" | null;
  status: "OK" | "ERROR";
  error: string | null;
};
```

**Note:** The output shape is the same on all code paths. There are no conditional fields.

## Logic & Invariants

### 1. Feature Flag Behavior
**Flag:** `FF_GLOBAL_CONNECTOR_STATE_MERGER`

**Disabled (`!== "true"`):**
Returns safe defaults:
- `global_health`: "UNKNOWN"
- `global_drift`: "UNRESOLVED"
- `merged_state`: {}
- `capability_matrix`: {}
- `routing_profile`: { active_primary_paths: 0, fallback_dependencies: 0, degraded_connectors: [], routing_failures: 0 }
- `feature_flag_enabled`: false
- `stop_reason`: "FEATURE_DISABLED"
- `status`: "OK"
- `error`: null
- `determinism_hash`: Computed over the canonical disabled payload.

**Enabled (`=== "true"`):**
Executes full logic. Invalid input returns `status: "ERROR"`, `stop_reason: "INVALID_INPUT"`.

### 2. Global Aggregation Rules
- **Global Health Ladder:**
    1. Any `BROKEN` -> **BROKEN**
    2. Any `DEGRADED` -> **DEGRADED**
    3. Else -> **OK**
- **Global Drift Ladder:**
    1. Any `UNRESOLVED` -> **UNRESOLVED**
    2. Any `PARTIALLY_RESOLVED` -> **PARTIALLY_RESOLVED**
    3. Else -> **RESOLVED**
- **Capability Matrix:**
    - Derived only from `capabilities_by_connector_key`.
    - Include capability keys where value is exactly `true`.
    - Capability keys sorted lexicographically.
    - Connector lists for each capability sorted lexicographically.
- **Routing Profile:**
    - `active_primary_paths`: count `active_role === "PRIMARY"`
    - `fallback_dependencies`: count `active_role === "FALLBACK"`
    - `routing_failures`: count `routing_status === "FAILED"` OR (`switch_attempted === true` AND `switched === false`)
    - `degraded_connectors`: list of keys where `health_state !== "OK"`, sorted lexicographically.

### 3. Determinism and No Mutation
- **Deep Clone:** Input is deep-cloned at the start.
- **No Mutation Verification:** Before returning, Phase 57 MUST deep-clone the working `inputClone` into `postClone` and verify `JSON.stringify(inputClone) === JSON.stringify(postClone)`. If not, the engine MUST throw an `ENGINE_ERROR`.
- **Canonical Sorting Strategy:**
    Phase 57 MUST recursively sort:
    1. All object keys lexicographically
    2. All arrays of strings lexicographically
    3. All arrays of objects maintain order but recursively sort keys inside each object
    This applies to `merged_state`, `capability_matrix`, `routing_profile.degraded_connectors`, and `connector_states_by_key` inside determinism payload.
- **Determinism Hash:** SHA-256 computed over the canonical payload:
    - `connector_states_by_key`
    - `global_health`
    - `global_drift`
    - `capability_matrix`
    - `routing_profile`
- **Output Freezing:** The final output object MUST be deep-frozen before returning.

### 4. Routing Status Whitelist
Phase 57 MUST NOT infer `routing_status`. ONLY the following values are permitted:
- "STABLE"
- "SWITCHED"
- "FAILED"

If `routing_status` exists and is not one of these values, Phase 57 MUST produce `INVALID_INPUT`.

### 5. Error Handling
- **INVALID_INPUT:** Triggered by schema violations, extra fields, or invalid enums.
- **ENGINE_ERROR:** Triggered by unexpected runtime exceptions.
- **Response Shape (Both Paths):**
    - `global_health`: "BROKEN"
    - `global_drift`: "UNRESOLVED"
    - `capability_matrix`: {}
    - `routing_profile`: { zeros }
    - `merged_state`: {}
    - `feature_flag_enabled`: true
    - `status`: "ERROR"
    - `stop_reason`: Set correctly ("INVALID_INPUT" or "ENGINE_ERROR")
    - `error`: Human readable message
    - `determinism_hash`: Computed over the canonical error payload

## Contract Identifiers

- Input contract: `global_connector_state_merger_input_contract_v1`
- Output contract: `global_connector_state_merger_output_contract_v1`
- Feature flag: `FF_GLOBAL_CONNECTOR_STATE_MERGER`

## Test Outline
The test suite (`__tests__/global_connector_state_merger_engine.test.js`) covers:
- **6 Happy Path Tests:** All OK, Mixed States, Mixed Drift, Capabilities, Routing, Determinism Hash.
- **6 Negative Path Tests:** Unknown field, Invalid enums (health, drift, role), Invalid types, Missing fields.
- **4 Edge Case Tests:** Zero connectors, Single connector, Large capability set, Partial capabilities.
- **1 Regression Test:** Feature Flag Disabled.
- **1 Determinism Test:** Order Independence.

## 13. Backplane Integration

*   Phase 57 aggregates states that are instances of `connector_backplane_v1.snapshot_shape`.
*   It respects the `capabilities` definitions from Phase 27B when building the global capability matrix.
*   It uses `connector_backplane_v1.metadata_fields` for cross-connector identity resolution.
