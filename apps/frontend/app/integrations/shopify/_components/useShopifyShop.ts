import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const SHOPIFY_SHOP_KEY = 'SHOPIFY_SHOP';

export function useShopifyShop() {
    const searchParams = useSearchParams();
    // Initialize with whatever searchParams has, or null
    // Safely get shop from searchParams (might be null during SSR)
    const [shop, setShop] = useState<string | null>(() => {
        try {
            const initialShop = searchParams?.get('shop') || null;
            console.log('[useShopifyShop] Initial state - shop from searchParams:', initialShop);
            if (!initialShop && typeof window !== 'undefined') {
                const storedShop = window.sessionStorage.getItem(SHOPIFY_SHOP_KEY);
                console.log('[useShopifyShop] Initial state - shop from sessionStorage:', storedShop);
                return storedShop;
            }
            return initialShop;
        } catch (error) {
            console.warn('[useShopifyShop] Error in initial state:', error);
            // During SSR or before searchParams is ready
            if (typeof window !== 'undefined') {
                const storedShop = window.sessionStorage.getItem(SHOPIFY_SHOP_KEY);
                console.log('[useShopifyShop] Initial state (catch) - shop from sessionStorage:', storedShop);
                return storedShop;
            }
            return null;
        }
    });

    useEffect(() => {
        console.log('[useShopifyShop] useEffect triggered');
        try {
            const queryShop = searchParams?.get('shop');
            console.log('[useShopifyShop] Shop from searchParams:', queryShop);
            console.log('[useShopifyShop] Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');

            if (queryShop) {
                // If present in URL, verify and store it
                console.log('[useShopifyShop] ✅ Shop found in URL, setting shop:', queryShop);
                setShop(queryShop);
                if (typeof window !== 'undefined') {
                    window.sessionStorage.setItem(SHOPIFY_SHOP_KEY, queryShop);
                    console.log('[useShopifyShop] Saved shop to sessionStorage:', queryShop);
                }
            } else {
                // If missing from URL, try to recover from storage
                console.log('[useShopifyShop] ⚠️ Shop not in URL, checking sessionStorage...');
                if (typeof window !== 'undefined') {
                    const storedShop = window.sessionStorage.getItem(SHOPIFY_SHOP_KEY);
                    console.log('[useShopifyShop] Shop from sessionStorage:', storedShop);
                    if (storedShop) {
                        console.log('[useShopifyShop] ✅ Using shop from sessionStorage:', storedShop);
                        setShop(storedShop);
                    } else {
                        console.warn('[useShopifyShop] ❌ No shop found in URL or sessionStorage');
                    }
                }
            }
        } catch (error) {
            console.error('[useShopifyShop] Error in useEffect:', error);
            // If searchParams is not ready yet, try to get from storage
            if (typeof window !== 'undefined') {
                const storedShop = window.sessionStorage.getItem(SHOPIFY_SHOP_KEY);
                console.log('[useShopifyShop] Error recovery - shop from sessionStorage:', storedShop);
                if (storedShop) {
                    setShop(storedShop);
                }
            }
        }
    }, [searchParams]);

    console.log('[useShopifyShop] Returning shop:', shop);
    return shop;
}
