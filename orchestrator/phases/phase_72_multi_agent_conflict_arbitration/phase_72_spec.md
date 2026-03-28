# Phase 72: Multi-Agent Conflict Arbitration (Spec v1)

## 1. Goal
Deterministically resolve conflicts between multiple agents competing for limited resources (Connectors, Budget, Timeline) within a single execution tick.

## 2. Input Contract
`phase_72_multi_agent_conflict_arbitration_v1`

### Required Fields
- `execution_id` (string): Unique trace ID.
- `phase` (string): Must be `'72'`.
- `feature_flags` (object): Must contain `FF_MULTI_AGENT_CONFLICT_ARBITRATION: true`.
- `agent_claims` (object): Map of Agent ID -> Claims.
- `policy_rules` (object): Global policy configuration.
- `knowledge_caps` (object): Dynamic capacity limits for connectors.

### Agent Claims Object
```json
{
  "agent_id": {
    "priority_score": 10,
    "connectors_requested": ["google_ads", "slack"],
    "budget_requested": { "amount": 100, "currency": "USD" },
    "timeline_requested": { "start_block": 100, "end_block": 200 }
  }
}
```

## 3. Operations & Algorithm

### 3.1 Deterministic Sorting
Agents are processed in a strict deterministic order to ensure fairness and reproducibility:
1.  **Priority Score** (Descending)
2.  **Agent ID** (Lexicographical Ascending, tie-breaker)

### 3.2 Arbitration Logic

#### A. Connectors
- **Limit**: defined in `knowledge_caps[conn_id].max_concurrent_agents`.
- **Action**: If usage count < max, APPROVE and increment usage. Else DENY.

#### B. Budget
- **Limit**: defined in `policy_rules.budget_allocation[agent_id].max_amount`.
- **Action**: If requested <= max, APPROVE. If requested > max, CAP at max and flag `BUDGET_LIMIT_EXCEEDED`.

#### C. Timeline
- **Limit**: defined by `policy_rules.timeline_allocation.allow_overlap` (bool).
- **Action**: 
    - If `allow_overlap` is true: Always APPROVE.
    - If `allow_overlap` is false: Check against `timelineSlots`. If no overlap with previously granted slots, APPROVE and Add to slots. Else DENY (`TIMELINE_CONFLICT`).

## 4. Output Contract

### Result Object
```json
{
  "connector_assignments": { "conn_id": ["agent_id_1", "agent_id_2"] },
  "budget_assignments": { "agent_id": { "approved_amount": 100, "denied_reasons": [] } },
  "timeline_assignments": { "agent_id": { "start_block": 100, "end_block": 200, "denied_reasons": [] } },
  "arbitration_log": [
    { "agent_id": "a1", "decisions": ["Connector X: APPROVED", "Budget: CAPPED at 50"] }
  ]
}
```
**Determinism**: All map keys and list values in the output are sorted (keys alphabetic, lists by priority/id order implied or explicit sort) to ensure JSON stability.

## 5. Success Envelope
Returns `status: 'SUCCESS'` on validation pass, even if decisions result in denials.
Returns `status: 'VALIDATION_FAILED'` or `status: 'FEATURE_DISABLED'` otherwise.
