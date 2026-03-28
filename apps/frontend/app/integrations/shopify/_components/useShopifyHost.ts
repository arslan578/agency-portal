import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const SHOPIFY_HOST_KEY = 'SHOPIFY_HOST';

export function useShopifyHost() {
    const searchParams = useSearchParams();
    // Initialize with whatever searchParams has, or null
    // Safely get host from searchParams (might be null during SSR)
    const [host, setHost] = useState<string | null>(() => {
        try {
            const initialHost = searchParams?.get('host') || null;
            if (!initialHost && typeof window !== 'undefined') {
                const storedHost = window.sessionStorage.getItem(SHOPIFY_HOST_KEY);
                return storedHost;
            }
            return initialHost;
        } catch {
            // During SSR or before searchParams is ready
            if (typeof window !== 'undefined') {
                return window.sessionStorage.getItem(SHOPIFY_HOST_KEY);
            }
            return null;
        }
    });

    useEffect(() => {
        try {
            const queryHost = searchParams?.get('host');

            if (queryHost) {
                // If present in URL, verify and store it
                // Basic validation: must be a string. 
                // In v4 App Bridge, host is base64 encoded.
                setHost(queryHost);
                if (typeof window !== 'undefined') {
                    window.sessionStorage.setItem(SHOPIFY_HOST_KEY, queryHost);
                }
            } else {
                // If missing from URL, try to recover from storage
                if (typeof window !== 'undefined') {
                    const storedHost = window.sessionStorage.getItem(SHOPIFY_HOST_KEY);
                    if (storedHost) {
                        setHost(storedHost);
                    }
                }
            }
        } catch (error) {
            // If searchParams is not ready yet, try to get from storage
            if (typeof window !== 'undefined') {
                const storedHost = window.sessionStorage.getItem(SHOPIFY_HOST_KEY);
                if (storedHost) {
                    setHost(storedHost);
                }
            }
        }
    }, [searchParams]);

    return host;
}
