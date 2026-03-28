'use client';
import { Page, Layout, CalloutCard, Banner, Button } from '@shopify/polaris';
import { useShopifyShop } from './_components/useShopifyShop';
import { useShopifyHost } from './_components/useShopifyHost';
import { useAppBridge } from '@shopify/app-bridge-react';
import { Redirect } from '@shopify/app-bridge/actions';
import { useEffect, useState, Suspense, useCallback, useMemo } from 'react';
import { LoadingSpinner } from './_components/LoadingSpinner';
import { toast } from 'sonner';
import { useSessionToken } from './_components/useSessionToken';
import { createShopifyEmbeddedClient } from '@/lib/api/shopifyEmbeddedClient';

function ShopifyHomePageContent() {
    const shop = useShopifyShop();
    const host = useShopifyHost();
    const app = useAppBridge();
    const { getSessionToken, isEmbedded, loading: sessionTokenLoading } = useSessionToken();
    const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'not_connected'>('checking');
    const [isConnecting, setIsConnecting] = useState(false);

    // Create API client that uses session tokens for embedded context
    const apiClient = useMemo(() => {
        if (isEmbedded) {
            return createShopifyEmbeddedClient(getSessionToken);
        }
        return null;
    }, [isEmbedded, getSessionToken]);

    const checkConnection = useCallback(async () => {
        if (!shop) {
            console.log('[Shopify Home] checkConnection: No shop parameter, skipping');
            return;
        }
        
        console.log('[Shopify Home] checkConnection: Starting connection check for shop:', shop);
        console.log('[Shopify Home] checkConnection: isEmbedded:', isEmbedded, 'apiClient available:', !!apiClient);
        setConnectionStatus('checking');
        
        try {
            const endpoint = `/api/proxy/integrations/shopify/status?shop_domain=${encodeURIComponent(shop)}`;
            console.log('[Shopify Home] checkConnection: Fetching status from:', endpoint);
            
            let data: any;
            
            if (isEmbedded && apiClient) {
                // Use session token authenticated client for embedded context
                console.log('[Shopify Home] checkConnection: Using session token authentication');
                data = await apiClient.get(endpoint, { cache: 'no-store' as any });
            } else {
                // Fallback to regular fetch (non-embedded or during loading)
                console.log('[Shopify Home] checkConnection: Using regular fetch (not embedded or apiClient not ready)');
                const response = await fetch(endpoint, {
                    cache: 'no-store'
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[Shopify Home] checkConnection: Response not OK:', response.status, errorText);
                    setConnectionStatus('not_connected');
                    return;
                }
                
                data = await response.json();
            }
            
            console.log('[Shopify Home] checkConnection: Response data:', data);
            const isConnected = data.connected === true;
            console.log('[Shopify Home] checkConnection: Store connected:', isConnected);
            setConnectionStatus(isConnected ? 'connected' : 'not_connected');
        } catch (error) {
            console.error('[Shopify Home] checkConnection: Exception occurred:', error);
            setConnectionStatus('not_connected');
        }
    }, [shop, isEmbedded, apiClient]);

    useEffect(() => {
        console.log('[Shopify Home] useEffect: Shop changed, shop:', shop, 'host:', host);
        
        // Check connection status when shop is available
        if (shop) {
            console.log('[Shopify Home] useEffect: Shop available, checking connection');
            checkConnection();
        } else {
            console.log('[Shopify Home] useEffect: No shop parameter, setting status to not_connected');
            setConnectionStatus('not_connected');
        }
    }, [shop, checkConnection]);
    
    // Check for new app install on mount
    useEffect(() => {
        if (shop && host && connectionStatus === 'not_connected') {
            const urlParams = new URLSearchParams(window.location.search);
            const hasHmac = urlParams.has('hmac');
            const hasIdToken = urlParams.has('id_token');
            const hasEmbedded = urlParams.has('embedded');
            
            console.log('[Shopify Home] Install check: shop:', shop, 'host:', host, 'hmac:', hasHmac, 'id_token:', hasIdToken, 'embedded:', hasEmbedded);
            
            // If we have embedded params but no connection, this might be a fresh install
            // Don't auto-trigger OAuth, let user click button (Shopify handles install flow)
            if (hasHmac && hasIdToken && hasEmbedded) {
                console.log('[Shopify Home] Install check: Fresh install detected (has embedded params)');
            }
        }
    }, [shop, host, connectionStatus]);

    // Listen for OAuth callback success message
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'SHOPIFY_AUTH_SUCCESS') {
                console.log('[Shopify Home] OAuth success message received:', event.data);
                // Recheck connection status after OAuth completes
                if (shop) {
                    setTimeout(() => {
                        checkConnection();
                    }, 1000);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [shop, checkConnection]);

    const handleConnectStore = () => {
        console.log('[Shopify Home] ========== handleConnectStore CALLED ==========');
        
        if (isConnecting) {
            console.log('[Shopify Home] handleConnectStore: Already connecting, ignoring click');
            return;
        }
        
        if (!shop) {
            console.error('[Shopify Home] handleConnectStore: ERROR - Shop parameter missing');
            toast.error('Shop parameter is missing. Please refresh the page.');
            return;
        }
        
        console.log('[Shopify Home] handleConnectStore: Setting isConnecting to true');
        setIsConnecting(true);
        
        console.log('[Shopify Home] handleConnectStore: Environment check');
        console.log('  - Shop:', shop);
        console.log('  - Host:', host);
        console.log('  - App Bridge available:', !!app);
        console.log('  - Window available:', typeof window !== 'undefined');
        console.log('  - Window.top:', typeof window !== 'undefined' ? (window.top ? 'exists' : 'null') : 'N/A');
        console.log('  - Window.self:', typeof window !== 'undefined' ? (window.self ? 'exists' : 'null') : 'N/A');
        
        // Check if we're in an iframe
        const isInIframe = typeof window !== 'undefined' && window.top && window.top !== window.self;
        console.log('[Shopify Home] handleConnectStore: In iframe:', isInIframe);
        
        // Build OAuth URL with shop and host parameters
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        console.log('[Shopify Home] handleConnectStore: Base URL:', baseUrl);
        
        let authUrl = `${baseUrl}/api/proxy/integrations/shopify/auth?shop=${encodeURIComponent(shop)}`;
        if (host) {
            authUrl += `&host=${encodeURIComponent(host)}`;
            console.log('[Shopify Home] handleConnectStore: Added host parameter to URL');
        }
        
        console.log('[Shopify Home] handleConnectStore: Final OAuth URL:', authUrl);
        
        // CRITICAL: For embedded apps, OAuth MUST break out of iframe
        // Shopify's accounts.shopify.com cannot load in iframe (X-Frame-Options: deny)
        // We need to redirect the top window, not the iframe
        
        if (isInIframe) {
            console.log('[Shopify Home] handleConnectStore: Embedded app detected - MUST redirect top window');
            try {
                // Navigate top window directly so OAuth query params (shop/host) are preserved.
                if (window.top) {
                    window.top.location.href = authUrl;
                } else {
                    throw new Error('Top window is not available');
                }
                console.log('[Shopify Home] handleConnectStore: ✅ Top window redirect started');
                // Don't reset isConnecting - let redirect happen
                return;
            } catch (topRedirectError) {
                const error = topRedirectError as Error;
                console.error('[Shopify Home] handleConnectStore: ❌ Top window redirect failed:', error);
                
                // Fallback: Try App Bridge Redirect
                if (app) {
                    try {
                        console.log('[Shopify Home] handleConnectStore: Trying App Bridge Redirect as fallback');
                        const redirect = Redirect.create(app);
                        redirect.dispatch(Redirect.Action.REMOTE, authUrl);
                        console.log('[Shopify Home] handleConnectStore: ✅ App Bridge Redirect dispatched');
                        return;
                    } catch (appBridgeError) {
                        const appError = appBridgeError as Error;
                        console.error('[Shopify Home] handleConnectStore: ❌ App Bridge Redirect also failed:', appError);
                    }
                }
                
                setIsConnecting(false);
                toast.error('Unable to start OAuth flow. Please try refreshing the page.');
            }
        } else {
            // Not in iframe - normal redirect
            console.log('[Shopify Home] handleConnectStore: Not in iframe - using normal window.location redirect');
            try {
                window.location.href = authUrl;
                console.log('[Shopify Home] handleConnectStore: ✅ window.location.href set successfully');
            } catch (e) {
                const error = e as Error;
                console.error('[Shopify Home] handleConnectStore: ❌ ERROR setting window.location.href:', error);
                setIsConnecting(false);
                toast.error('Unable to start OAuth flow. Error: ' + error.message);
            }
        }
    };

    const promoteUrl = `/integrations/shopify/promote${shop ? `?shop=${shop}` : ''}`;

    return (
        <Page title="Kaivo for Shopify">
            <Layout>
                <Layout.Section>
                    {connectionStatus === 'not_connected' && shop && (
                        <Banner tone="warning" title="Store Not Connected" onDismiss={() => {}}>
                            <p>Please connect your Shopify store to start promoting products.</p>
                        </Banner>
                    )}
                    {connectionStatus === 'checking' && (
                        <Banner tone="info" title="Checking connection..." onDismiss={() => {}}>
                            <p>Verifying store connection...</p>
                        </Banner>
                    )}
                    {connectionStatus === 'connected' && (
                        <Banner tone="success" title="Store Connected" onDismiss={() => {}}>
                            <p>Your Shopify store is connected and ready to use.</p>
                        </Banner>
                    )}
                    <CalloutCard
                        title="Promote your products with Kaivo"
                        illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                        primaryAction={
                            connectionStatus === 'connected'
                                ? {
                                      content: 'Promote a product',
                                      url: promoteUrl,
                                  }
                                : {
                                      content: isConnecting ? 'Connecting...' : 'Connect Store',
                                      onAction: handleConnectStore,
                                  }
                        }
                    >
                        <p>
                            Launch high-performance ad campaigns across multiple channels directly from Shopify.
                            {connectionStatus !== 'connected' && (
                                <span style={{ display: 'block', marginTop: '8px', color: '#6B7280' }}>
                                    Connect your store first to get started.
                                </span>
                            )}
                        </p>
                    </CalloutCard>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

export default function ShopifyHomePage() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <ShopifyHomePageContent />
        </Suspense>
    );
}
