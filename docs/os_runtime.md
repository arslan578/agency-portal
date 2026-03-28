# Kaivo OS Runtime Service

**Status**: Active / Experimental (Guarded by Feature Flag)
**Service**: `os-runtime-service`
**Port**: 3000 (Internal)

## Overview
The OS Runtime Service exposes the Node.js Orchestrator (`orchestrator/dispatcher.js`) via a strict HTTP contract. It enables the OS to be called by the API Gateway, Python Agent, or future external triggers.

## Architecture
- **Service**: Node.js Express app.
- **Location**: `services/os_runtime_service`.
- **Core Logic**: Wraps `orchestrator/dispatcher.js`.
- **Auth**: Relies on API Gateway / Mesh auth (service is internal).

## Endpoints

### `POST /os/run`
Executes an orchestrator intent.

**Request**:
```json
{
  "execution_id": "uuid",
  "intent": "INTENT_NAME",
  "payload": { ... },
  "requested_at": "ISO-TIMESTAMP"
}
```

**Response**:
```json
{
  "execution_id": "uuid",
  "intent": "INTENT_NAME",
  "requested_at": "ISO-TIMESTAMP",
  "completed_at": "ISO-TIMESTAMP",
  "result": { ... },
  "canonical_hash": "sha256-hash-of-result"
}
```

### `GET /os/capabilities`
Returns the list of supported intents and phases.

**Response (Enabled)**:
```json
{
  "environment": "production",
  "version": "1.0.0",
  "available_intents": [
    "SAFETY_LAYER_EVALUATION_V1",
    "EXECUTION_ASSEMBLY_V1"
  ],
  "platforms": ["meta", "google_ads"],
  "features": {
    "ff_os_runtime_enabled": true
  }
}
```

**Response (Disabled / Fallback)**:
```json
{
  "environment": "production",
  "platforms": ["meta", "google_ads"],
  "features": {
    "ff_os_runtime_enabled": false
  }
}
```

| Flag | Component | Description | Default |
| :--- | :--- | :--- | :--- |
| `FF_OS_RUNTIME_ENABLED` | API Gateway | Enables public routing to the OS Runtime. | `false` |
| `FF_AGENT_CAN_CALL_OS_RUNTIME` | Agent Service | Allows Python Agent tools to call OS Runtime. | `false` |
