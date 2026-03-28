# Kaivo v2.0 Billing System

## Core Concepts
Billing is calculated by aggregating `UsageRecord` entries for a specific period (usually monthly).

### Usage Record
Each `UsageRecord` contains three spend values:
1.  `spend_base`: What the platform (Meta/TikTok) charged.
2.  `spend_kaivo`: Base * 1.50 (Kaivo's revenue).
3.  `spend_agency`: Kaivo * ClientMarkup (Agency's revenue).

## Invoicing Process
1.  **Aggregation**: The system sums up all `UsageRecord`s for a client within the billing period.
2.  **Draft Generation**: A draft `Invoice` is created with the calculated totals.
3.  **Review**: Agency Admin reviews the draft.
4.  **Finalization**: Invoice status moves to `SENT` or `PAID`.

## API Endpoints

### `GET /billing/clients`
**Query Param**: `agency_id`
Returns a list of clients with their Month-to-Date (MTD) spend and markup earned.

### `GET /billing/invoices/:id`
Returns the full details of a specific invoice.

### `POST /billing/invoices/generate`
Triggers the generation of a draft invoice for a specific date range.
