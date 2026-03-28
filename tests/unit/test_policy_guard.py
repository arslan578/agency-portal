import pytest
from services.policy_service.guard import check_policy

def test_policy_meta_text_ratio():
    # Pass case
    result = check_policy("meta", "image", {"text_ratio": 0.1})
    assert result.passed is True
    assert len(result.warnings) == 0
    
    # Warning case
    result = check_policy("meta", "image", {"text_ratio": 0.3})
    assert result.passed is True # It's a warning, not a block
    assert len(result.warnings) > 0

def test_policy_tiktok_duration():
    # Pass case
    result = check_policy("tiktok", "video", {"duration": 15})
    assert result.passed is True
    
    # Fail case (too short)
    result = check_policy("tiktok", "video", {"duration": 3})
    assert result.passed is False
    assert len(result.violations) > 0
    
    # Fail case (too long)
    result = check_policy("tiktok", "video", {"duration": 61})
    assert result.passed is False

def test_policy_x_political():
    # Fail case
    result = check_policy("x", "image", {"is_political": True})
    assert result.passed is False
    assert "prohibited" in result.violations[0]

def test_policy_roku_category():
    # Fail case
    result = check_policy("roku", "video", {"category": "gambling"})
    assert result.passed is False
    assert "prohibited" in result.violations[0]
