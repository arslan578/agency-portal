# Agency System Documentation

## Overview
The Kaivo Agency System allows agencies to manage multiple clients, apply custom markups, and restrict user access.

## Hierarchy
-   **Agency**: The top-level entity. Owns multiple Clients.
-   **Client**: Represents a specific brand or customer. Has a `markup_multiplier`.
-   **Campaign**: Belongs to a Client (or directly to the Agency if `client_id` is null).

## Markup Logic
1.  **Kaivo Markup**: 1.50x applied globally to all raw CPMs.
2.  **Agency Markup**: Applied *after* Kaivo markup at render-time.
    -   `display_cpm = stored_cpm * client.markup_multiplier`

## Roles
-   **Agency Owner**: Full access.
-   **Client Viewer**: Restricted access. Can only view reports and performance. Cannot launch or edit campaigns.

## Drift Detection
A background task (`check_platform_campaign_state_task`) monitors for state mismatches between Kaivo and external platforms (e.g., Kaivo shows "Paused", Platform shows "Active").
