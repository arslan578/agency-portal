# Testing Guide

This document outlines the testing strategy and instructions for the Kaivo platform.

## Test Structure

The tests are organized into the following categories:

-   **Unit Tests** (`tests/unit/`): Verify individual components and functions in isolation.
    -   `test_mcp_tools.py`: Tests all 11 MCP tools.
    -   `test_intelligence.py`: Tests scoring and budget optimization logic.
    -   `test_policy_guard.py`: Tests policy validation rules.
    -   `test_multilingual.py`: Tests translation and variant generation stubs.
-   **Integration Tests** (`tests/integration/`): Verify interactions between components.
    -   `test_orchestrator.py`: Tests intent routing and tool calling sequences.
    -   `test_adapters.py`: Tests adapter retry logic, timeouts, and error handling.
-   **End-to-End Tests** (`tests/e2e/`): Verify full user flows.
    -   `test_campaign_flow.py`: Simulates the complete lifecycle from planning to launch.

## Running Tests

We use `pytest` as the test runner.

### Prerequisites

Ensure you have the virtual environment activated and dependencies installed:

```bash
source .venv/bin/activate
pip install -r services/agent_service/requirements.txt
pip install pytest pytest-asyncio httpx
```

### Running All Tests

```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)
export DATABASE_URL=sqlite:///:memory:
pytest tests/
```

### Running Specific Categories

**Unit Tests:**
```bash
pytest tests/unit/
```

**Integration Tests:**
```bash
pytest tests/integration/
```

**E2E Tests:**
```bash
pytest tests/e2e/
```

## Test Coverage

| Component | Type | Coverage | Status |
| :--- | :--- | :--- | :--- |
| MCP Tools | Unit | 100% (11/11 Tools) | ✅ Passing |
| Intelligence | Unit | Core Logic | ✅ Passing |
| Policy Guard | Unit | Blocking/Advisory | ✅ Passing |
| Multilingual | Unit | Stubs | ✅ Passing |
| Orchestrator | Integration | Planning & Execution | ✅ Passing |
| Adapters | Integration | Retries & Timeouts | ✅ Passing |
| Campaign Flow | E2E | Plan -> Launch | ✅ Passing |

## Known Issues

-   **Pydantic Warnings**: You may see warnings about `.dict()` being deprecated. We are migrating to `.model_dump()`.
-   **SQLAlchemy Warnings**: Deprecation warnings for `declarative_base` may appear.
-   **Mocked LLM**: The Orchestrator tests currently use heuristic routing instead of a real LLM.
-   **Stubbed Adapters**: External platform calls (Meta, Roku) are currently stubbed in tests.
