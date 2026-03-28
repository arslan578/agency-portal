'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';

export type FeatureFlags = {
    FF_SHOPIFY_APP_ENABLED?: boolean;
    FF_OS_RUNTIME_ENABLED?: boolean;
    [key: string]: boolean | undefined;
};

type Capabilities = {
    environment: string;
    platforms: string[];
    features: FeatureFlags;
};

type CapabilitiesContextType = {
    capabilities: Capabilities;
    loading: boolean;
};

const defaultCapabilities: Capabilities = {
    environment: 'unknown',
    platforms: [],
    features: {},
};

const CapabilitiesContext = createContext<CapabilitiesContextType>({
    capabilities: defaultCapabilities,
    loading: true,
});

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
    const [capabilities, setCapabilities] = useState<Capabilities>(defaultCapabilities);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCapabilities = async () => {
            try {
                // Use apiClient which handles base URL automatically
                const data = await apiClient.get<Capabilities>('/capabilities');
                if (data) {
                    setCapabilities({
                        ...defaultCapabilities,
                        ...data,
                        features: data.features ?? {},
                    });
                } else {
                    console.warn('Capabilities fetch returned empty, using defaults');
                }
            } catch (error) {
                console.error('Capabilities fetch error:', error);
                // Keep default safe state on error
            } finally {
                setLoading(false);
            }
        };

        fetchCapabilities();
    }, []);

    return (
        <CapabilitiesContext.Provider value={{ capabilities, loading }}>
            {children}
        </CapabilitiesContext.Provider>
    );
}

export const useCapabilities = () => useContext(CapabilitiesContext);
