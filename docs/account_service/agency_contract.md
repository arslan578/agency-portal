# Agency System API Contract

This document defines the contract for the Agency System (Agency & Client management).
It specifically outlines the Compatibility Shims maintained for legacy internal services and tests.

## 1. Agency Creation

**Endpoint:** `POST /agency`
**Schema:** `AgencyCreate` -> `AgencyOut`

### Compatibility Shim: `owner_user_id`
*   **Request:** `owner_user_id` (int) is REQUIRED in the input schema.
*   **Behavior:** The router uses this ID to create the initial `AgencyMembership` (Role: ADMIN).
*   **Response:**
    *   The `Agency` database model does NOT have an `owner_user_id` column.
    *   **Shim:** The router manually attaches `.owner_user_id = input.owner_user_id` to the returned object.
    *   **Reason:** Legacy unit tests (`test_agency_system.py`) assert this attribute exists on the return value.

## 2. Client Creation

**Endpoint:** `POST /agency/{agency_id}/clients`
**Schema:** `ClientCreate` -> `ClientOut`

### Compatibility Shim: Legacy Aliases
The `ClientCreate` schema supports the following aliases via its `__init__` method:

| Legacy Field | Standard Field | Notes |
| :--- | :--- | :--- |
| `client_name` | `name` | Used by older Adapter tests. |
| `markup_multiplier` | `markup_percent` | Used by older Adapter tests. |

### Compatibility Shim: Response Attributes
*   The `Client` database model uses `name` and `markup_percent`.
*   **Shim:** The router manually attaches `.client_name` and `.markup_multiplier` to the returned SQLAlchemy model.
*   **Reason:** Legacy unit tests assert these attributes exist on the return value.

## 3. Maintenance Policy

**Do not remove these shims** without:
1.  Updating `tests/unit/test_agency_system.py`.
2.  Auditing all consumers of the Account Service (specifically Adapters v1).

The goal is to move all consumers to `name` and `markup_percent` eventually, but this contract is currently LOCKED.
