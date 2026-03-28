"""
Kaivo i18n Translation Service - Production Implementation
Google Cloud Translation API integration
"""

import os
import requests
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Supported Languages (130+ aligned with Google Translate & frontend lib/languages.ts)
SUPPORTED_LANGUAGES = [
    {"code": "af", "name": "Afrikaans"},
    {"code": "sq", "name": "Albanian"},
    {"code": "am", "name": "Amharic"},
    {"code": "ar", "name": "Arabic"},
    {"code": "hy", "name": "Armenian"},
    {"code": "as", "name": "Assamese"},
    {"code": "ay", "name": "Aymara"},
    {"code": "az", "name": "Azerbaijani"},
    {"code": "bm", "name": "Bambara"},
    {"code": "eu", "name": "Basque"},
    {"code": "be", "name": "Belarusian"},
    {"code": "bn", "name": "Bengali"},
    {"code": "bho", "name": "Bhojpuri"},
    {"code": "bs", "name": "Bosnian"},
    {"code": "bg", "name": "Bulgarian"},
    {"code": "ca", "name": "Catalan"},
    {"code": "ceb", "name": "Cebuano"},
    {"code": "ny", "name": "Chichewa"},
    {"code": "zh", "name": "Chinese (Simplified)"},
    {"code": "zh-TW", "name": "Chinese (Traditional)"},
    {"code": "co", "name": "Corsican"},
    {"code": "hr", "name": "Croatian"},
    {"code": "cs", "name": "Czech"},
    {"code": "da", "name": "Danish"},
    {"code": "dv", "name": "Dhivehi"},
    {"code": "doi", "name": "Dogri"},
    {"code": "nl", "name": "Dutch"},
    {"code": "en", "name": "English"},
    {"code": "eo", "name": "Esperanto"},
    {"code": "et", "name": "Estonian"},
    {"code": "ee", "name": "Ewe"},
    {"code": "tl", "name": "Filipino"},
    {"code": "fi", "name": "Finnish"},
    {"code": "fr", "name": "French"},
    {"code": "fy", "name": "Frisian"},
    {"code": "gl", "name": "Galician"},
    {"code": "ka", "name": "Georgian"},
    {"code": "de", "name": "German"},
    {"code": "el", "name": "Greek"},
    {"code": "gn", "name": "Guarani"},
    {"code": "gu", "name": "Gujarati"},
    {"code": "ht", "name": "Haitian Creole"},
    {"code": "ha", "name": "Hausa"},
    {"code": "haw", "name": "Hawaiian"},
    {"code": "iw", "name": "Hebrew"},
    {"code": "hi", "name": "Hindi"},
    {"code": "hmn", "name": "Hmong"},
    {"code": "hu", "name": "Hungarian"},
    {"code": "is", "name": "Icelandic"},
    {"code": "ig", "name": "Igbo"},
    {"code": "ilo", "name": "Ilocano"},
    {"code": "id", "name": "Indonesian"},
    {"code": "ga", "name": "Irish"},
    {"code": "it", "name": "Italian"},
    {"code": "ja", "name": "Japanese"},
    {"code": "jw", "name": "Javanese"},
    {"code": "kn", "name": "Kannada"},
    {"code": "kk", "name": "Kazakh"},
    {"code": "km", "name": "Khmer"},
    {"code": "rw", "name": "Kinyarwanda"},
    {"code": "gom", "name": "Konkani"},
    {"code": "ko", "name": "Korean"},
    {"code": "kri", "name": "Krio"},
    {"code": "ku", "name": "Kurdish (Kurmanji)"},
    {"code": "ckb", "name": "Kurdish (Sorani)"},
    {"code": "ky", "name": "Kyrgyz"},
    {"code": "lo", "name": "Lao"},
    {"code": "la", "name": "Latin"},
    {"code": "lv", "name": "Latvian"},
    {"code": "ln", "name": "Lingala"},
    {"code": "lt", "name": "Lithuanian"},
    {"code": "lg", "name": "Luganda"},
    {"code": "lb", "name": "Luxembourgish"},
    {"code": "mk", "name": "Macedonian"},
    {"code": "mai", "name": "Maithili"},
    {"code": "mg", "name": "Malagasy"},
    {"code": "ms", "name": "Malay"},
    {"code": "ml", "name": "Malayalam"},
    {"code": "mt", "name": "Maltese"},
    {"code": "mi", "name": "Maori"},
    {"code": "mr", "name": "Marathi"},
    {"code": "mni-Mtei", "name": "Meiteilon (Manipuri)"},
    {"code": "lus", "name": "Mizo"},
    {"code": "mn", "name": "Mongolian"},
    {"code": "my", "name": "Myanmar (Burmese)"},
    {"code": "ne", "name": "Nepali"},
    {"code": "no", "name": "Norwegian"},
    {"code": "or", "name": "Odia (Oriya)"},
    {"code": "om", "name": "Oromo"},
    {"code": "ps", "name": "Pashto"},
    {"code": "fa", "name": "Persian"},
    {"code": "pl", "name": "Polish"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "pa", "name": "Punjabi"},
    {"code": "qu", "name": "Quechua"},
    {"code": "ro", "name": "Romanian"},
    {"code": "ru", "name": "Russian"},
    {"code": "sm", "name": "Samoan"},
    {"code": "sa", "name": "Sanskrit"},
    {"code": "gd", "name": "Scots Gaelic"},
    {"code": "nso", "name": "Sepedi"},
    {"code": "sr", "name": "Serbian"},
    {"code": "st", "name": "Sesotho"},
    {"code": "sn", "name": "Shona"},
    {"code": "sd", "name": "Sindhi"},
    {"code": "si", "name": "Sinhala"},
    {"code": "sk", "name": "Slovak"},
    {"code": "sl", "name": "Slovenian"},
    {"code": "so", "name": "Somali"},
    {"code": "es", "name": "Spanish"},
    {"code": "su", "name": "Sundanese"},
    {"code": "sw", "name": "Swahili"},
    {"code": "sv", "name": "Swedish"},
    {"code": "tg", "name": "Tajik"},
    {"code": "ta", "name": "Tamil"},
    {"code": "tt", "name": "Tatar"},
    {"code": "te", "name": "Telugu"},
    {"code": "th", "name": "Thai"},
    {"code": "ti", "name": "Tigrinya"},
    {"code": "ts", "name": "Tsonga"},
    {"code": "tr", "name": "Turkish"},
    {"code": "tk", "name": "Turkmen"},
    {"code": "ak", "name": "Twi (Akan)"},
    {"code": "uk", "name": "Ukrainian"},
    {"code": "ur", "name": "Urdu"},
    {"code": "ug", "name": "Uyghur"},
    {"code": "uz", "name": "Uzbek"},
    {"code": "vi", "name": "Vietnamese"},
    {"code": "cy", "name": "Welsh"},
    {"code": "xh", "name": "Xhosa"},
    {"code": "yi", "name": "Yiddish"},
    {"code": "yo", "name": "Yoruba"},
    {"code": "zu", "name": "Zulu"},
]


class TranslatorService:
    """
    Production translation service using Google Cloud Translation API.
    Uses REST API for API key authentication (similar to creative_service).
    """
    
    def __init__(self):
        """
        Initialize Google Cloud Translation client.
        Requires GOOGLE_TRANSLATE_API_KEY or GOOGLE_APPLICATION_CREDENTIALS.
        """
        self.api_key = None
        self.use_service_account = False
        self.client = None
        
        # Check for API key first (REST API approach)
        api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY")
        
        # Check for service account (for google.cloud.translate_v2.Client)
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

        if api_key:
            self.api_key = api_key
            self.use_service_account = False
            logger.info("Google Translate client initialized with API Key (REST API mode)")
        elif creds_path:
            try:
                from google.cloud import translate_v2 as translate
                self.client = translate.Client()
                self.use_service_account = True
                logger.info("Google Translate client initialized with Application Credentials")
            except Exception as e:
                logger.error(f"Failed to initialize Google Translate with service account: {e}")
                self.client = None
                self.api_key = None
        else:
            logger.warning("No Google Translate credentials found (API Key or Service Account). Translation will be unavailable.")
            self.api_key = None
            self.client = None
    
    def get_languages(self) -> List[Dict[str, str]]:
        """Return list of supported languages."""
        return SUPPORTED_LANGUAGES
    
    def translate_text(
        self,
        text: str,
        target_lang: str,
        source_lang: Optional[str] = None
    ) -> str:
        """
        Translate text using Google Cloud Translation API.
        
        Args:
            text: Text to translate
            target_lang: Target language code (e.g., 'es', 'fr')
            source_lang: Source language code (optional, auto-detected if not provided)
        
        Returns:
            Translated text
            
        Raises:
            RuntimeError: If translation client is not initialized
            Exception: If translation fails
        """
        # Skip translation if source and target are the same
        if source_lang and source_lang == target_lang:
            return text
        
        # Use REST API if API key is available
        if self.api_key:
            return self._translate_via_rest_api(text, target_lang, source_lang)
        
        # Use client library if service account is configured
        elif self.use_service_account and self.client:
            return self._translate_via_client_library(text, target_lang, source_lang)
        
        else:
            raise RuntimeError(
                "Translation service unavailable. Please configure GOOGLE_TRANSLATE_API_KEY "
                "or GOOGLE_APPLICATION_CREDENTIALS environment variable."
            )
    
    def _translate_via_rest_api(
        self,
        text: str,
        target_lang: str,
        source_lang: Optional[str] = None
    ) -> str:
        """Translate using Google Translate REST API (for API key auth)."""
        url = "https://translation.googleapis.com/language/translate/v2"
        params = {
            "q": text,
            "target": target_lang,
            "key": self.api_key,
            "format": "text"
        }
        if source_lang and source_lang != 'auto':
            params['source'] = source_lang
        
        try:
            response = requests.post(url, params=params)
            response.raise_for_status()
            result = response.json()
            translated_text = result['data']['translations'][0]['translatedText']
            logger.debug(f"Translated '{text[:50]}...' from {source_lang or 'auto'} to {target_lang}")
            return translated_text
        except Exception as e:
            logger.error(f"Translation failed for target={target_lang}: {e}")
            raise Exception(f"Translation error: {str(e)}")
    
    def _translate_via_client_library(
        self,
        text: str,
        target_lang: str,
        source_lang: Optional[str] = None
    ) -> str:
        """Translate using google.cloud.translate_v2.Client (for service account auth)."""
        try:
            result = self.client.translate(
                text,
                target_language=target_lang,
                source_language=source_lang
            )
            translated_text = result.get("translatedText", text)
            logger.debug(f"Translated '{text[:50]}...' from {source_lang or 'auto'} to {target_lang}")
            return translated_text
        except Exception as e:
            logger.error(f"Translation failed for target={target_lang}: {e}")
            raise Exception(f"Translation error: {str(e)}")


# Singleton instance
translator = TranslatorService()
