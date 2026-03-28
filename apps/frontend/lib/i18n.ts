import { useState, useEffect } from 'react';

export interface Language {
    code: string;
    name: string;
}

export interface I18nState {
    currentLang: string;
    languages: Language[];
    translations: Record<string, string>;
    version: string;
}

// const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com'; // Deprecated

import { apiClient as api } from './api/client';

export const i18nService = {
    async getLanguages(): Promise<Language[]> {
        try {
            // Direct backend endpoint: /i18n/languages
            const res = await api.get<{ languages: Language[] }>('/i18n/languages');
            // Check if res has languages key or is the array itself. 
            // Legacy response was { languages: [...] }. 
            // If apiClient returns that object, we need res.languages.
            return res.languages || [];
        } catch (e) {
            console.error("Failed to fetch languages", e);
            // Fallback to English if API fails (critical for UI to render)
            return [{ code: "en", name: "English" }];
        }
    },

    async getTranslations(lang: string): Promise<Record<string, string>> {
        // 1. Check LocalStorage Cache
        const cached = localStorage.getItem(`i18n_${lang}`);
        if (cached) {
            return JSON.parse(cached);
        }

        try {
            // 2. Fetch from Backend
            // Note: In a real scenario, we might want to fetch from a CDN or static file
            // But for this requirement, we'll assume an endpoint or fallback to local file

            // Try fetching from public folder first for 'en' as it is the source of truth
            if (lang === 'en') {
                const enRes = await fetch('/locales/en.json');
                const enData = await enRes.json();
                localStorage.setItem(`i18n_en`, JSON.stringify(enData));
                return enData;
            }

            // For other languages, call the backend translation endpoint
            const res = await api.get<Record<string, string>>(`/i18n/translations/${lang}`);
            const data = res; // apiClient returns data

            localStorage.setItem(`i18n_${lang}`, JSON.stringify(data));
            return data;

        } catch (e) {
            console.error(`Failed to fetch translations for ${lang}`, e);
            // Fallback to English
            const enRes = await fetch('/locales/en.json');
            return await enRes.json();
        }
    }
};
