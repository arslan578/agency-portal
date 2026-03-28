# Kaivo Phase Guards

Phase Guards define invariants that later work must not break.  
They protect cross phase contracts so the orchestrator remains stable as new modules are added.

These guards apply to all implementation work, for all phases.

---

## Global Invariants

### 1. Orchestrator Envelope

All orchestrator modules must return a standard envelope:

```js
{
  ok: boolean,
  module: string,
  timestamp: string,
  payload: any,
  error?: {
    code: string,
    message: string,
    details?: any
  }
}
```

The fields and types must not change.
New modules may define their own payload shape, but must keep this envelope intact.

### 2. Dispatcher Contract

The dispatcher entry point signature must not change.
New intent types may be added, but existing routing and behavior must not be altered unless a phase explicitly updates it.

### 3. No Hidden IO

Modules from Phases 1 to 11 use pure logic only, except where a phase explicitly allows IO.
No module in these phases may:
- open network connections
- read or write files
- read environment variables

### 4. Determinism

Modules must behave deterministically for the same input:
- no randomness
- no time based branching
- no ordering that depends on hash maps or non deterministic iteration

### 5. Backward Compatibility

New phases must not silently change:
- the input shape of previous modules
- the output shape of previous modules
- names or types of existing fields

If a contract change is needed, it must be documented in the spec and implemented as a new versioned intent or object, not a silent rewrite.

---

## Phase Specific Notes

**Phase 7, Audience Engine**
- Input: brand level and campaign goal context.
- Output: deterministic audience representation used as audience_hint in later phases.
- Must not be coupled to any real platform API.

**Phase 8, Campaign Plan**
- Produces a CampaignPlan that describes intent, not execution.
- Must not contain platform specific fields.

**Phase 9, Budget Plan**
- BudgetPlan is the single source of financial truth.
- Venue level spend allocations must be derived from this object only.

**Phase 10, Venue Execution Plan**
- VenueExecutionPlan is the first cross venue execution representation.
- Must not include platform API details, only roles, objectives, spend, creative requirements, and audience hints.

**Phase 11, Platform Payload Bundle**
- PlatformPayloadBundle combines abstract structure and platform flavor only.
- Must not call any external SDKs.
- Must not contain real API request payloads, only internal structures.

---

## Usage

Every new implementation prompt given to an AI agent must:
1. include the AG Preamble
2. include the Phase Guards block
3. define the specific phase spec

This keeps the system coherent while you add more phases over time.
