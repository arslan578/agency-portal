# Kaivo v1.1 Upgrade Documentation

## 1. AI Onboarding System
-   **Endpoint**: `POST /onboarding/analyze`
-   **Purpose**: Analyzes brand docs and recommends goals/platforms.
-   **Model**: `OnboardingProfile` tracks readiness scores.

## 2. Paid-Tier Audience Upload
-   **Endpoint**: `POST /audience/upload`
-   **Restriction**: Paid tiers only.
-   **Security**: PII is hashed (SHA-256) before storage.
-   **Model**: `Audience` now supports `is_uploaded` and `hashed_identifiers`.

## 3. Agency System Enhancements
-   **Billing**: `Agency` model now includes `default_markup`, `invoice_cycle`, `po_number`.
-   **Dashboard**: `GET /agency/{id}/dashboard` provides aggregated stats.

## 4. Drift Detection Upgrade
-   **Model**: `CampaignStateDrift` now includes `severity` and `explanation`.
-   **Logic**: Detects status mismatches (High Severity). Placeholder logic for budget/pacing.

## 5. Orchestrator Upgrades
-   **New Intents**:
    -   "Help me start" -> Onboarding
    -   "Help me upload" -> Audience Upload Guide
    -   "Explain drift" -> Drift Analysis
