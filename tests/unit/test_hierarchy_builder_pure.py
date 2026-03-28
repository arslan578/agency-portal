"""Pure helpers for client hierarchy (no DB)."""

import pytest

from services.account_service.hierarchy_builder import (
    normalize_platform_key,
    platform_display_name,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Facebook", "meta"),
        ("META", "meta"),
        ("google_ads", "google"),
        ("TikTok", "tiktok"),
        ("", "unknown"),
    ],
)
def test_normalize_platform_key(raw, expected):
    assert normalize_platform_key(raw) == expected


def test_platform_display_name_meta():
    assert platform_display_name("meta") == "Meta"


def test_platform_display_name_unknown_key():
    assert "snap" in platform_display_name("snapchat").lower()
