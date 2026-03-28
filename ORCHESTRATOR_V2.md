# Kaivo v2.0 Orchestrator

## Overview
The Orchestrator is the AI brain of Kaivo, handling chat interactions, strategic analysis, and drift detection.

## Capabilities

### 1. Conversational Interface
- **Endpoint**: `POST /orchestrator/chat`
- **Logic**: Processes natural language or structured intents (`help_start`, `explain_drift`) and returns structured responses with UI actions (buttons, links).

### 2. Onboarding Intelligence
- **Endpoint**: `POST /onboarding/analyze`
- **Logic**: Takes brand details and budget, returns a "Readiness Score" and platform recommendations.

### 3. Drift Detection
- **Background Task**: Runs periodically via Celery.
- **Logic**: Compares current campaign performance (CPA, CPM) against historical baselines.
- **Events**: If deviation > threshold, creates a `CampaignStateDrift` record.
- **Resolution**: Users can "Apply Fix" via the UI, which calls `POST /drift/events/:id/apply`.

## API Contract (Chat)
```json
{
  "messages": [
    { "role": "assistant", "content": "I noticed a drop in conversion rate." }
  ],
  "actions": [
    { "label": "Fix it", "value": "fix_drift" }
  ],
  "language": "en"
}
```
