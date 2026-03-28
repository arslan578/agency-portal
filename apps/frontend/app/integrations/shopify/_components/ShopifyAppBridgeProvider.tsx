'use client';

import { ReactNode, useMemo, useState, useEffect } from 'react';
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react';
import { Banner, Page, Layout, Text, Spinner } from '@shopify/polaris';
import { useShopifyHost } from './useShopifyHost';

export function ShopifyAppBridgeProvider({ children }: { children: ReactNode }) {
    const host = useShopifyHost();
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '';
    const [showWarning, setShowWarning] = useState(false);

    useEffect(() => {
        // If host is missing, wait a bit before showing warning to avoid flashing it during hydration/storage retrieval
        let timer: ReturnType<typeof setTimeout>;
        if (!host) {
            timer = setTimeout(() => {
                console.warn('[ShopifyAppBridgeProvider] Host parameter missing after grace period.');
                setShowWarning(true);
            }, 750);
        } else {
            setShowWarning(false);
        }
        return () => clearTimeout(timer);
    }, [host]);

    const config = useMemo(
        () => ({ apiKey, host: host || '', forceRedirect: true }),
        [apiKey, host]
    );

    if (!apiKey) {
        return (
            <Page>
                <Layout>
                    <Layout.Section>
                        <Banner tone="critical" title="Configuration Error">
                            <Text as="p" variant="bodyMd">
                                Missing <code>NEXT_PUBLIC_SHOPIFY_API_KEY</code> in the hosting environment.
                            </Text>
                        </Banner>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    // Host is optional for some pages (like campaigns list) but required for App Bridge functionality
    // If host is missing, we'll still render children but App Bridge features won't work
    // This allows direct URL access to campaigns page for testing/debugging
    if (!host) {
        if (!showWarning) {
            // Grace period: Render a simple loading state (or nothing) while we wait for storage/params
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
                    {/* Use Polaris spinner if available safely, or basic fallback */}
                    <div className="Polaris-Spinner Polaris-Spinner--sizeLarge">
                        <svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15.542 1.487A21.507 21.507 0 00.5 22c0 11.874 9.626 21.5 21.5 21.5 9.847 0 18.364-6.675 20.809-15.726l-4.154-1.166C36.608 33.818 29.609 39.5 22 39.5c-9.665 0-17.5-7.835-17.5-17.5s7.835-17.5 17.5-17.5c4.386 0 8.356 1.612 11.398 4.255l2.853-3.048A21.463 21.463 0 0022 .5c-2.28 0-4.475.394-6.458 1.05z" fill="currentColor"></path>
                        </svg>
                    </div>
                </div>
            );
        }

        // If host is missing but we're past grace period, show warning but still render children
        // This allows pages like campaigns to work without App Bridge
        return (
            <>
                <Page>
                    <Layout>
                        <Layout.Section>
                            <Banner tone="warning" title="Missing Host Parameter" onDismiss={() => setShowWarning(false)}>
                                <Text as="p" variant="bodyMd">
                                    This app should be loaded within Shopify Admin for full functionality. 
                                    Some features may not work without the <code>host</code> parameter.
                                </Text>
                            </Banner>
                        </Layout.Section>
                    </Layout>
                </Page>
                {/* Still render children even without host - allows direct URL access */}
                {children}
            </>
        );
    }

    return <AppBridgeProvider config={config}>{children}</AppBridgeProvider>;
}
