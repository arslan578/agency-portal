'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';

export default function IntegrationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname();

    // Shopify embedded app renders inside an iframe with its own Polaris UI.
    // The main Kaivo sidebar must NOT appear — its links point to Kaivo
    // dashboard routes that require a Kaivo auth token, which doesn't exist
    // in the embedded context and would redirect to /auth/signin.
    const isShopifyEmbedded = pathname?.startsWith('/integrations/shopify');

    if (isShopifyEmbedded) {
        return <>{children}</>;
    }

    return (
        <div className="flex bg-background min-h-screen">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 ml-64">
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}

