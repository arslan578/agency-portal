import pytest
from services.agent_service.multilingual import translate_text, generate_multilingual_variants

def test_translate_text():
    result = translate_text(["Hello World"], "es")
    assert result[0] == "[es] Hello World"

def test_generate_multilingual_variants():
    result = generate_multilingual_variants(
        base_text="Buy Now",
        languages=["es", "fr"]
    )
    assert len(result) == 2
    assert "[es]" in result["es"]
    assert "[fr]" in result["fr"]
