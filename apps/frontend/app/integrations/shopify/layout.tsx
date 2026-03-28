'use client';
import { AppProvider, Frame } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import enTranslations from '@shopify/polaris/locales/en.json';
import { ShopifyAppBridgeProvider } from './_components/ShopifyAppBridgeProvider';
import { ShopifyNavigation } from './_components/ShopifyNavigation';
import { Suspense } from 'react';

export default function ShopifyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Note: App Bridge script is now loaded from root layout (app/layout.tsx)
    // as the first script tag in <head> to satisfy Shopify's "first script" requirement

    return (
        <>
            <div className="shopify-scope">
                <AppProvider i18n={enTranslations}>
                    <Suspense
                    fallback={
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                            {/* Use basic HTML to avoid Polaris dependency issues during suspense */}
                            <div className="Polaris-Spinner Polaris-Spinner--sizeLarge">
                                <svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M15.542 1.487A21.507 21.507 0 00.5 22c0 11.874 9.626 21.5 21.5 21.5 9.847 0 18.364-6.675 20.809-15.726l-4.154-1.166C36.608 33.818 29.609 39.5 22 39.5c-9.665 0-17.5-7.835-17.5-17.5s7.835-17.5 17.5-17.5c4.386 0 8.356 1.612 11.398 4.255l2.853-3.048A21.463 21.463 0 0022 .5c-2.28 0-4.475.394-6.458 1.05z" fill="currentColor"></path>
                                </svg>
                            </div>
                            <span style={{ marginLeft: '10px', fontFamily: '-apple-system, BlinkMacSystemFont, San Francisco, Segoe UI, Roboto, Helvetica Neue, sans-serif' }}>
                                Loading Kaivo...
                            </span>
                        </div>
                    }
                >
                    <ShopifyAppBridgeProvider>
                        <Frame navigation={<ShopifyNavigation />}>
                            {children}
                        </Frame>
                    </ShopifyAppBridgeProvider>
                </Suspense>
            </AppProvider>
        </div>
        </>
    );
}

