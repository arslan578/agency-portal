import os
import requests
from typing import List, Dict, Any, Optional
from openai import OpenAI
import json

# Configuration
GOOGLE_TRANSLATE_API_KEY = os.getenv("GOOGLE_TRANSLATE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class TranslationService:
    def __init__(self):
        if OPENAI_API_KEY:
            self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
        else:
            print("WARNING: OpenAI API Key missing. Naturalization features disabled.")
            self.openai_client = None
        
    def translate_raw(self, text: str, target_lang: str, source_lang: Optional[str] = None) -> str:
        """
        Translates text using Google Translate API (v2).
        """
        if not GOOGLE_TRANSLATE_API_KEY:
            # Mock behavior for development if key is missing (safe failover)
            print("WARNING: Google Translate API Key missing. Returning mock translation.")
            return f"[Simulated {target_lang}] {text}"
            
        url = "https://translation.googleapis.com/language/translate/v2"
        params = {
            "q": text,
            "target": target_lang,
            "key": GOOGLE_TRANSLATE_API_KEY,
            "format": "text"
        }
        if source_lang and source_lang != 'auto':
            params['source'] = source_lang
        
        try:
            response = requests.post(url, params=params)
            response.raise_for_status()
            result = response.json()
            return result['data']['translations'][0]['translatedText']
        except Exception as e:
            print(f"Google Translate Error: {e}")
            return f"[Error: {str(e)}] {text}"

    def naturalize(self, raw_translation: str, original_text: str, target_lang: str, context_type: str = "ad_copy", source_lang: str = "detected language") -> Dict[str, Any]:
        """
        Uses OpenAI to naturalize and optimize the translation for advertising context.
        """
        system_prompt = f"""You are an expert global copywriter. 
Your task is to refine a raw machine translation of an advertisement into a natural, persuasive, and culturally appropriate version for the target language ({target_lang}).
Ensure the tone is professional yet engaging.
"""

        user_prompt = f"""
Original Text ({source_lang}): "{original_text}"
Raw Translation ({target_lang}): "{raw_translation}"
Context: {context_type} (Headline/Body Copy/CTA)

Please provide:
1. The Naturalized/Optimized Text (final ad copy).
2. A brief Rationale.
3. The Tone.

Return JSON format: {{ "text": "...", "rationale": "...", "tone": "..." }}
"""
        
        try:
            if not self.openai_client:
                raise ValueError("OpenAI Client not initialized (Missing API Key)")

            response = self.openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI Naturalization Error: {e}")
            return {
                "text": raw_translation,
                "rationale": "Raw translation used due to AI error.",
                "tone": "Neutral"
            }

    def process_translations(self, items: Dict[str, List[str]], target_languages: List[str], source_lang: Optional[str] = None) -> Dict[str, Any]:
        """
        Main entry point.
        """
        results = {}
        
        for lang in target_languages:
            results[lang] = {}
            for item_type, texts in items.items():
                results[lang][item_type] = []
                for text in texts:
                    # 1. Raw Translation
                    raw = self.translate_raw(text, lang, source_lang)
                    
                    # 2. Naturalization
                    naturalized = self.naturalize(raw, text, lang, context_type=item_type, source_lang=source_lang or "detected")
                    
                    results[lang][item_type].append({
                        "original": text,
                        "raw_translation": raw,
                        "naturalized_text": naturalized.get("text"),
                        "rationale": naturalized.get("rationale"),
                        "tone": naturalized.get("tone")
                    })
                    
        return results

    def recommend_languages_for_geo(self, countries: List[str]) -> List[Dict[str, str]]:
        """
        Returns recommended languages based on input countries.
        Uses a static mapping for speed, can be enhanced with AI.
        """
        # ISO 3166-1 alpha-2 to Language Code mapping (Common primary/secondary)
        geo_lang_map = {
            "US": [{"code": "en", "name": "English"}, {"code": "es", "name": "Spanish"}],
            "CA": [{"code": "en", "name": "English"}, {"code": "fr", "name": "French"}],
            "MX": [{"code": "es", "name": "Spanish"}],
            "GB": [{"code": "en", "name": "English"}],
            "FR": [{"code": "fr", "name": "French"}],
            "DE": [{"code": "de", "name": "German"}],
            "IT": [{"code": "it", "name": "Italian"}],
            "ES": [{"code": "es", "name": "Spanish"}, {"code": "ca", "name": "Catalan"}],
            "BR": [{"code": "pt", "name": "Portuguese"}],
            "JP": [{"code": "ja", "name": "Japanese"}],
            "CN": [{"code": "zh", "name": "Chinese (Simplified)"}],
            "IN": [{"code": "hi", "name": "Hindi"}, {"code": "en", "name": "English"}],
            # Add more as needed
        }
        
        recommendations = []
        seen_codes = set()
        
        for country in countries:
            # Handle full names if passed (simple lookup)
            # Assuming input could be "United States" or "US"
            # For this MVP, let's assume standard codes or handle basic normalization if needed
            # In frontend we use full names like "United States", so let's normalize strictly if we had a library.
            # Ideally we pass ISO codes. For now, let's just try to map the most common ones or specific strings.
            
            # Simple heuristic for this specific map:
            c_upper = country.upper()
            
            # Map full names to codes if needed (basic set)
            if country == "United States": c_upper = "US"
            if country == "Canada": c_upper = "CA"
            if country == "United Kingdom": c_upper = "GB"
            if country == "France": c_upper = "FR"
            if country == "Germany": c_upper = "DE"
            if country == "Spain": c_upper = "ES"
            if country == "Mexico": c_upper = "MX"
            if country == "Brazil": c_upper = "BR"
            
            langs = geo_lang_map.get(c_upper, [])
            for l in langs:
                if l['code'] not in seen_codes:
                    recommendations.append(l)
                    seen_codes.add(l['code'])
                    
        # Default fallback if empty
        if not recommendations and countries:
            # If we don't know the country, suggesting English is a safe default for digital ads
            recommendations.append({"code": "en", "name": "English (Default)"})
            
        return recommendations

# Singleton instance
translation_service = TranslationService()
