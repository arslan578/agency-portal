# Frontend Backlog

**Status**: PENDING
**Focus**: Post-Vertical Slice Improvements

## 1. Product Knowledge Management
**Feature Flag**: `FF_PRODUCT_KNOWLEDGE_UI`
- **Dependency**: `creative-service` endpoints (`/brands/{id}/product-docs`) exist but need UI integration.
- **Task**: storage of PDF/Text docs for RAG.

## 2. Advanced Creative Studio
**Feature Flag**: `FF_AI_CREATIVE_GENERATION`
- **Dependency**: `creative-service` generation endpoint exists.
- **Task**: Build complex UI for iterating on variants, editing text, and swapping images.

## 3. Onboarding Wizard Refinement
**Feature Flag**: `FF_ONBOARDING_WIZARD`
- **Task**: Deep integration of the "Analyzer" steps with actual `policy-service` and `intelligence-service`.
- **Current State**: Mocked or partial.

## 4. Drift Remediation UI
**Feature Flag**: `FF_DRIFT_UI`
- **Task**: UI for reviewing and applying drift fixes from `policy-service` alerts.

## 5. Billing & Subscription
**Dependency**: `billing-service`
- **Task**: Subscription management UI, invoice listing.
