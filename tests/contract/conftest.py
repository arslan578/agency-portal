"""
Contract tests conftest.

These tests need the real api_gateway, but with TEST_MODE enabled
to skip mounting service routers (which would conflict with patching).
"""
import pytest

# Note: Parent conftest may have already patched some modules.
# Contract tests rely on TEST_MODE=true being set before api_gateway import
# to prevent router mounting issues.
