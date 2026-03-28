'use client';

import { useAppBridge } from '@shopify/app-bridge-react';
import { useState, useEffect, useCallback } from 'react';
import { getSessionToken as bridgeGetSessionToken } from '@shopify/app-bridge/utilities';

/**
 * Hook to get Shopify session token for embedded app authentication.
 * 
 * Session tokens are required for Shopify App Store compliance:
 * "Using session tokens for user authentication"
 * 
 * Tokens expire after 1 minute, so they should be fetched fresh for each request.
 * 
 * @returns Object with:
 *   - getSessionToken: Function to get a fresh token (async)
 *   - isEmbedded: Boolean indicating if app is running in Shopify embedded context
 *   - loading: Boolean indicating if initial check is in progress
 */
export function useSessionToken() {
    const app = useAppBridge();
    const [isEmbedded, setIsEmbedded] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if we're in embedded context
        // If app bridge is available and we have a host parameter, we're embedded
        // Also check sessionStorage since host may not be in URL after in-app navigation
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const hasHost = urlParams.has('host') || !!window.sessionStorage.getItem('SHOPIFY_HOST');
            setIsEmbedded(!!app && hasHost);
        }
        setLoading(false);
    }, [app]);

    /**
     * Get a fresh session token from App Bridge.
     * Tokens are short-lived (1 minute), so call this for each API request.
     * 
     * @returns Promise<string> - Session token JWT
     * @throws Error if not in embedded context or token fetch fails
     */
    const getSessionToken = useCallback(async (): Promise<string> => {
        if (!app) {
            throw new Error('App Bridge not initialized - cannot get session token');
        }

        if (!isEmbedded) {
            throw new Error('Not in Shopify embedded context - session tokens only work in embedded apps');
        }

        try {
            // Get session token from App Bridge
            // This is a JWT that contains shop info and user info
            const token = await bridgeGetSessionToken(app);
            
            if (!token) {
                throw new Error('Session token is empty');
            }

            console.log('[useSessionToken] Successfully fetched session token');
            return token;
        } catch (error) {
            console.error('[useSessionToken] Failed to get session token:', error);
            throw new Error(`Failed to get session token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, [app, isEmbedded]);

    return {
        getSessionToken,
        isEmbedded,
        loading,
    };
}
