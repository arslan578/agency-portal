# Responses API Migration V1

This document outlines the changes and usage of the new Responses API client in Kaivo Core.

## Overview

The `services/shared/llm` module provides a centralized, typed, and featured-flagged gateway for all LLM interactions. It replaces direct usage of the OpenAI Node.js SDK.

### Key Features
- **Model Routing**: Dynamically selects models based on Task Type and Feature Flags.
- **Structured Outputs**: Enforces strict JSON schemas for deterministic responses.
- **Telemetry**: Structured logging of latency, token usage, and errors.
- **Error Normalization**: Maps provider errors (RateLimit, Timeout) to standard Kaivo errors.

## Configuration

The migration is controlled by the following environment variables.

| Variable | Default (Code) | Staging/Prod | Description |
| :--- | :--- | :--- | :--- |
| `FF_OPENAI_RESPONSES_ENABLED` | `false` | `true` (Staging) | Enables the new Responses API client path. (Note: Currently implicitly enabled by using `runLLM`, logic inside respects flags for specific behaviors) |
| `FF_OPENAI_MODEL_ROUTER_ENABLED` | `false` | `true` (Staging) | Enables the Model Router to select pinned models. If `false`, defaults to `gpt-4o`. |

### Enabled Models (When Router Enabled)

| Env Var | Value (Pinned) | Description |
| :--- | :--- | :--- |
| `OPENAI_MODEL_CORE` | `gpt-5.2` | General reasoning and orchestration. |
| `OPENAI_MODEL_GATING` | `gpt-5.2-pro` | High-stakes decision making. |
| `OPENAI_MODEL_TRANSFORM` | `gpt-5-mini` | High-volume data formatting. |
| `OPENAI_MODEL_TAGGING` | `gpt-5-nano` | Simple classification/tagging. |
| `OPENAI_MODEL_MULTIMODAL` | `gpt-4o` | Vision and multimodal tasks. |

## Usage Guide

### Migration Steps
To migrate an existing call site:
1.  Import `runLLM` from `services/shared/llm`.
2.  Identify the correct `TaskType` (see specific doc).
3.  Define a strict JSON Schema if the output is structured.
4.  Replace the `openai.chat.completions.create` call.

### Example

**Before:**
```javascript
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  response_format: { type: 'json_object' }
});
const result = JSON.parse(completion.choices[0].message.content);
```

**After:**
```javascript
import { runLLM } from '../../services/shared/llm';

const SCHEMA = {
  type: "object",
  properties: {
    result: { type: "string" }
  },
  required: ["result"],
  additionalProperties: false
};

const { outputJson } = await runLLM({
  task: 'ORCHESTRATION_CORE',
  messages: [...],
  jsonSchema: SCHEMA
});
// outputJson is strictly valid according to SCHEMA
```

## Adding New Task Types
1.  Add the Task Type to `LLMTaskType` in `services/shared/llm/types.js`.
2.  Add the mapping in `TASK_MODEL_MAPPING` in `services/shared/llm/router.js`.
3.  Add the corresponding environment variable to infrastructure.
