'use client';

import { Navigation } from '@shopify/polaris';
import { HomeIcon, ProductIcon, OrderIcon, SettingsIcon } from '@shopify/polaris-icons';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * In-app navigation for the Shopify embedded app.
 * Shows only the 4 allowed pages: Home, Promote Product, Campaigns, Settings.
 * 
 * This replaces the removed Kaivo sidebar, which was causing auth/signin
 * redirects because its links pointed to routes requiring Kaivo tokens.
 */
export function ShopifyNavigation() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const shop = searchParams?.get('shop');
    const host = searchParams?.get('host');
    const preservedQuery = new URLSearchParams();

    if (shop) {
        preservedQuery.set('shop', shop);
    }
    if (host) {
        preservedQuery.set('host', host);
    }

    const queryString = preservedQuery.toString();
    const withQuery = (path: string) => (queryString ? `${path}?${queryString}` : path);

    return (
        <Navigation location={pathname || ''}>
            <Navigation.Section
                items={[
                    {
                        url: withQuery('/integrations/shopify'),
                        label: 'Home',
                        icon: HomeIcon,
                        selected: pathname === '/integrations/shopify',
                        exactMatch: true,
                    },
                    {
                        url: withQuery('/integrations/shopify/promote'),
                        label: 'Promote Product',
                        icon: ProductIcon,
                        selected: pathname === '/integrations/shopify/promote',
                    },
                    {
                        url: withQuery('/integrations/shopify/campaigns'),
                        label: 'Campaigns',
                        icon: OrderIcon,
                        selected: pathname === '/integrations/shopify/campaigns',
                    },
                    {
                        url: withQuery('/integrations/shopify/settings'),
                        label: 'Settings',
                        icon: SettingsIcon,
                        selected: pathname === '/integrations/shopify/settings',
                    },
                ]}
            />
        </Navigation>
    );
}
