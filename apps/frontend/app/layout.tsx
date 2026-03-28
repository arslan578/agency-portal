import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { AgencyProvider } from '@/context/AgencyContext';
import { CapabilitiesProvider } from '@/context/CapabilitiesContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Kaivo',
    description: 'Agency Operating System',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // App Bridge API key for Shopify embedded apps
    const shopifyApiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '';

    return (
        <html lang="en">
            <head>
                {/* Ngrok bypass header for Cloudflare challenge */}
                <meta name="ngrok-skip-browser-warning" content="true" />
                
                {/* 
                    App Bridge CDN Script - MUST be first script, no async/defer
                    Required for Shopify App Store compliance: "Using the latest App Bridge script loaded from Shopify's CDN"
                    Shopify's automated checker verifies:
                    1. Script is loaded from cdn.shopify.com
                    2. Script is the first <script> tag in the document
                    3. Script has NO async, defer, or type=module attributes
                */}
                {shopifyApiKey && (
                    <script
                        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
                        data-api-key={shopifyApiKey}
                        // NO async, NO defer - must be synchronous blocking script
                    />
                )}
            </head>
            <body className={inter.className}>
                <ErrorBoundary>
                    <LanguageProvider>
                        <CapabilitiesProvider>
                            <AuthProvider>
                                <AgencyProvider>
                                    <NotificationProvider>
                                        <ThemeProvider>
                                            {children}
                                            <Toaster position="top-right" richColors />
                                        </ThemeProvider>
                                    </NotificationProvider>
                                </AgencyProvider>
                            </AuthProvider>
                        </CapabilitiesProvider>
                    </LanguageProvider>
                </ErrorBoundary>
            </body>
        </html>
    );
}
