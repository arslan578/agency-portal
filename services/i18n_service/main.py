from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.i18n_service.translator import translator

app = FastAPI(title="Kaivo i18n Service")

class TranslationRequest(BaseModel):
    text: str
    target_lang: str
    source_lang: Optional[str] = None

class TranslationResponse(BaseModel):
    original_text: str
    translated_text: str
    source_lang: Optional[str]
    target_lang: str

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/languages")
def list_languages():
    """
    Returns the list of supported languages.
    """
    return {"languages": translator.get_languages()}

@app.post("/translate", response_model=TranslationResponse)
def translate_text(request: TranslationRequest):
    """
    Translates text using Google Translate.
    """
    translated = translator.translate_text(
        request.text, 
        request.target_lang, 
        request.source_lang
    )
    
    return {
        "original_text": request.text,
        "translated_text": translated,
        "source_lang": request.source_lang,
        "target_lang": request.target_lang
    }
