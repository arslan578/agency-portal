# PHASE 12 SPEC — EXECUTION ASSEMBLY ENGINE

## Objective
Implement Phase 12: Execution Assembly Engine as a pure, deterministic module that:
- Consumes the existing VenueExecutionPlan from Phase 10, plus already existing creative and audience outputs.
- Produces an ExecutionAssemblyPlan that expresses, for each venue:
  - Which audiences will be used.
  - Which creatives will be attached.
  - How budget and schedule are applied at the unit level.
  - How naming and IDs are derived in a deterministic way.

This module does not talk to any external APIs. It does not know about Meta, Google, TikTok, etc. It works entirely in Kaivo’s neutral vocabulary.

## Global Constraints
- Dispatcher Contract: Do not change signature. Add new intent type "EXECUTION_ASSEMBLY_V1".
- Envelope Shape: Must be preserved. Module name: "execution_assembly".
- No Hidden IO: No network, file, or env access.
- Determinism: No randomness or time-based branching.
- Backward Compatibility: Do not modify existing input/output shapes.

## Files To Modify / Create
- `orchestrator/modules/execution_assembly_engine.js` (new)
- `orchestrator/dispatcher.js` (update)
- `orchestrator/tests/execution_assembly_engine.test.js` (new)

## Inputs
- `brand_id`: string
- `campaign_goal`: object
- `venue_execution_plan`: VenueExecutionPlan (Phase 10)
- `creative_plan`: object (optional/recommended)
- `audience_plan`: object (optional/recommended)

## Outputs
`ExecutionAssemblyPlan` schema:

```js
type ExecutionAssemblyPlan = {
  brand_id: string,
  campaign_goal: object,
  currency: string | null,
  total_budget: number,
  venues: Array<ExecutionVenueAssembly>,
  meta: object
}

type ExecutionVenueAssembly = {
  venue_key: string,
  role: string,
  priority: number,
  objective: string,
  primary_kpi: string,
  spend: { allocated: number, share: number },
  schedule: { start_date: string | null, end_date: string | null },
  execution_units: Array<ExecutionUnit>
}

type ExecutionUnit = {
  unit_id: string, // deterministic
  name: string,    // deterministic
  unit_kind: "LINE_ITEM" | "GROUP" | "AD",
  venue_key: string,
  audience_ref: string | null,
  creative_refs: string[],
  budget: { type: "LIFETIME" | "DAILY", amount: number },
  schedule: { start_date: string | null, end_date: string | null },
  tracking?: object
}
```

## Deterministic ID and Naming Rules
- `unit_id`: `${brand_id}__${venue_key}__unit_${index}`
- `name`: `${venue_key.toUpperCase()}_${objective}_${role}_UNIT_${index}`

## Assembly Logic
1. Validate Inputs: Return INVALID_INPUT if missing.
2. Derive Execution Units: Create at least one unit per venue.
3. Budget Allocation: Split venue budget equally among units.
4. Schedule: Copy from venue.
5. Tracking: Attach if available.

## Module API
Export `run_execution_assembly(context)`.
