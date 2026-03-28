# Model Routing Strategy V1

Kaivo Core now uses a task-based model routing strategy to optimize for performance, cost, and capability.

## Task Types Mapping

| Task Type | Model Env Var | Target Model | Intended Use Case |
| :--- | :--- | :--- | :--- |
| `ORCHESTRATION_CORE` | `OPENAI_MODEL_CORE` | `gpt-5.2` | **Default**. Complex reasoning, planning, audience analysis, creative generation. |
| `GATING_FINAL` | `OPENAI_MODEL_GATING` | `gpt-5.2-pro` | **Critical Decisions**. Final approvals, budget authorization, policy enforcement. **Requires Idempotency Key**. |
| `TRANSFORM` | `OPENAI_MODEL_TRANSFORM` | `gpt-5-mini` | **Pure Data Processing**. Reformatting JSON, extracting entities from structured text, rewriting. |
| `TAGGING` | `OPENAI_MODEL_TAGGING` | `gpt-5-nano` | **Classification**. Sentiment analysis, categorization, simple labeling. |
| `VISION` | `OPENAI_MODEL_MULTIMODAL` | `gpt-4o` | **Multimodal**. Image analysis, creative visual inspection. |

## Selection Logic

1.  **Router Flag Check**: logic checks `FF_OPENAI_MODEL_ROUTER_ENABLED`.
    -   If `false`: Returns `gpt-4o` (Legacy Behavior).
    -   If `true`: Proceeds to mapping.
2.  **Task Lookup**: Maps `task` argument to Environment Variable name.
3.  **Resolution**: Reads Environment Variable value.
    -   If missing: **Throws Config Error** (Fail Fast).

## Best Practices

-   **Prefer Specialized Tasks**: Don't default everything to `ORCHESTRATION_CORE` if it fits a lighter model.
-   **Gating Safety**: Always use `GATING_FINAL` for actions that spend money or change state, and ensure an `idempotencyKey` is passed.
-   **Vision Fallback**: Only `VISION` task supports image inputs. Do not send images to other task types.
