# Kaivo v2.0 Agency System

## Overview
The Agency System allows agencies to manage their clients, set pricing markups, and control user access.

## Key Capabilities

### 1. Client Management
- Agencies can create and manage multiple `Client` entities.
- Each Client has its own settings, campaigns, and audiences.

### 2. Markup Control
- Agencies can set a `markup_percent` per client.
- This markup is applied on top of the Kaivo Global Markup (1.5x).
- **Endpoint**: `POST /agency/clients/:id/markup`

### 3. Permissions & Access
- Agencies can control whether a Client's users can log in (`is_active`).
- **Endpoint**: `POST /agency/clients/:id/permissions`

## Authorization
- **Agency Admin**: Has full control over markups and permissions.
- **Agency Member**: Can view clients and manage campaigns but cannot change markups.

## Data Visibility
- Reports generated for Agency users show `spend_agency` (their revenue).
- Reports generated for Client users show `spend_agency` (their cost).
- The `spend_base` and `spend_kaivo` fields are hidden from Client users.
