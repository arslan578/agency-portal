# Kaivo v2.0 Multilingual Backend

## Overview
The i18n service provides translation capabilities for the Kaivo platform, leveraging the Google Cloud Translation API.

## Supported Languages
The backend maintains a static list of supported languages (aligned with Google Translate's core set) which can be extended.
Current support includes: English, Spanish, French, German, Chinese, Japanese, Portuguese, Italian, Russian, Arabic, Korean, Hindi.

## Integration
- **Google Cloud Translation API**: Used for high-quality machine translation.
- **Fallback**: If the client cannot initialize (e.g., missing credentials), it falls back to a mock translation for development safety.

## API Endpoints

### `GET /i18n/languages`
Returns the list of supported language codes and names.

### `POST /i18n/translate`
**Body**:
```json
{
  "text": "Hello world",
  "target_lang": "es",
  "source_lang": "en" // Optional
}
```
**Response**:
```json
{
  "original_text": "Hello world",
  "translated_text": "Hola Mundo",
  "source_lang": "en",
  "target_lang": "es"
}
```
