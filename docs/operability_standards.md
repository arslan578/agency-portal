# KaivoCore Operability Standards
**Status**: Enforced via Feature Flags
**Version**: 1.0 (Hardening Pass)

## 1. Observability Standards

### Structured Logging
All services must use `logStructuredRequired`.
**Required Fields**: `execution_id`, `phase`, `contract_version`.
Sensitive data (`password`, `token`, `key`) is automatically redacted.

```javascript
const logging = require('../../orchestrator/shared/logging');
logging.logStructuredRequired('EVENT_NAME', { ...data }, context);
```

## 2. Error Discipline
Use `KaivoError` for all internal errors.
**Fields**: `code`, `category`, `retryable`, `message`.

```javascript
throw new KaivoError({
  code: 'VALIDATION_FAILED',
  category: 'VALIDATION', // 400
  message: 'Invalid input'
});
```

**Retries**: Only errors with `retryable: true` or `category: UPSTREAM` (502/503) should be retried.

## 3. Determinism
JSON serialization must be stable (sorted keys).
Use `stable_json` module when critical (hashing, signing, contract output).

```javascript
const stableJson = require('../../orchestrator/shared/serialization/stable_json');
const json = stableJson.stringify(data); // Sorts keys if FF_STABLE_JSON=true
```

## 4. Security
- **Non-Root**: All containers run as user 1000.
- **Redaction**: Logs are scrubbed of secrets.
- **Registry**: Usage of `ghcr.io` is deprecated. Use `registry.digitalocean.com`.

## 5. Configuration
- **Strict Validation**: Services fail to start if `FF_STRICT_ENV_VALIDATION=true` and keys are missing.
- **Reference**: See `docs/production_config.md`.
