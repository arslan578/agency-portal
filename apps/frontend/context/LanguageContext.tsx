"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { i18nService } from '@/lib/i18n';

type Language = {
    code: string;
    name: string;
}

type LanguageContextType = {
    currentLanguage: string;
    setLanguage: (lang: string) => void;
    availableLanguages: Language[];
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [currentLanguage, setCurrentLanguage] = useState('en')
    const [availableLanguages, setAvailableLanguages] = useState<Language[]>([
        { code: 'en', name: 'English' }
    ])

    // Dictionary with translations
    const dictionary: Record<string, Record<string, string>> = {
        en: {
            "dashboard": "Dashboard",
            "campaigns": "Campaigns",
            "pricing": "Pricing",
            "settings": "Settings",
            "creative.title": "Creative Intelligence",
            "creative.generate_title": "Generate Variants",
            "creative.generate_desc": "Create high-performing variations of your ad copy using AI",
            "creative.base_text": "Base Text",
            "creative.target_language": "Target Language",
            "creative.generate_btn": "Generate Variants",
            "creative.generated_variants": "Generated Variants"
        },
        es: {
            "dashboard": "Tablero",
            "campaigns": "Campañas",
            "pricing": "Precios",
            "settings": "Ajustes",
            "creative.title": "Inteligencia Creativa",
            "creative.generate_title": "Generar Variantes",
            "creative.generate_desc": "Crea variaciones de alto rendimiento de tu texto publicitario usando IA",
            "creative.base_text": "Texto Base",
            "creative.target_language": "Idioma Objetivo",
            "creative.generate_btn": "Generar Variantes",
            "creative.generated_variants": "Variantes Generadas"
        }
    }

    useEffect(() => {
        let mounted = true;

        async function loadLanguages() {
            try {
                // Use the resilient service instead of raw fetch
                // This handles 404s and parser errors and provides a fallback list for the UI
                const languages = await i18nService.getLanguages();
                if (mounted && languages && languages.length > 0) {
                    setAvailableLanguages(languages);
                }
            } catch (err) {
                console.error("Failed to load languages", err);
                // i18nService returns a fallback, so this catch handles catastrophic failures
                // Ensure we at least have English
                if (mounted) {
                    setAvailableLanguages([{ code: 'en', name: 'English' }]);
                }
            }
        }

        loadLanguages();

        return () => { mounted = false; };
    }, [])

    const t = (key: string) => {
        return dictionary[currentLanguage]?.[key] || key
    }

    return (
        <LanguageContext.Provider value={{ currentLanguage, setLanguage: setCurrentLanguage, availableLanguages, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export const useTranslation = () => {
    const context = useContext(LanguageContext)
    if (!context) {
        throw new Error("useTranslation must be used within a LanguageProvider")
    }
    return context
}
