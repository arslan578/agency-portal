'use client';

import { Page, Layout, Card, IndexTable, Text, Badge, Banner, Spinner } from '@shopify/polaris';
import { useState, useEffect } from 'react';
import { useShopifyShop } from './useShopifyShop';
import { useSessionToken } from './useSessionToken';
import { createShopifyEmbeddedClient } from '@/lib/api/shopifyEmbeddedClient';

export const CampaignsContent = () => {
    console.log('[CampaignsContent] ========== Component Rendered ==========');
    console.log('[CampaignsContent] Component function called');
    
    const shop = useShopifyShop();
    const { getSessionToken } = useSessionToken();
    console.log('[CampaignsContent] Shop from hook (initial):', shop);

    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        console.group('[CampaignsContent] ========== useEffect Triggered ==========');
        console.log('[CampaignsContent] Shop from hook:', shop);
        console.log('[CampaignsContent] Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
        console.log('[CampaignsContent] Search params:', typeof window !== 'undefined' ? new URLSearchParams(window.location.search).toString() : 'N/A');
        
        async function fetchCampaigns() {
            console.log('[CampaignsContent] fetchCampaigns called');
            
            if (!shop) {
                console.warn('[CampaignsContent] ⚠️ Shop parameter is missing!');
                console.warn('[CampaignsContent] Cannot fetch campaigns without shop domain');
                console.warn('[CampaignsContent] Session storage shop:', typeof window !== 'undefined' ? window.sessionStorage.getItem('SHOPIFY_SHOP') : 'N/A');
                setError('Shop parameter is missing. Please navigate from the Shopify app home page.');
                setLoading(false);
                console.groupEnd();
                return;
            }
            
            console.log('[CampaignsContent] ✅ Shop parameter found:', shop);
            
            try {
                const apiUrl = '/api/proxy/integrations/shopify';
                console.log('[CampaignsContent] Making API request...');
                console.log('[CampaignsContent] API URL:', apiUrl);
                console.log('[CampaignsContent] Request params:', { shop_domain: shop });
                
                const apiClient = createShopifyEmbeddedClient(getSessionToken);
                const data = await apiClient.get<any>(`${apiUrl}/campaigns?shop_domain=${shop}`);
                
                console.log('[CampaignsContent] ✅ API Response received');
                console.log('[CampaignsContent] Response data:', data);
                console.log('[CampaignsContent] Campaigns count:', data?.campaigns?.length || 0);
                
                if (data?.campaigns) {
                    console.log('[CampaignsContent] Campaigns list:', data.campaigns);
                    console.log('[CampaignsContent] First campaign:', JSON.stringify(data.campaigns[0], null, 2));
                    if (data.campaigns[0]) {
                        console.log('[CampaignsContent] First campaign status:', data.campaigns[0]?.status);
                        console.log('[CampaignsContent] First campaign status type:', typeof data.campaigns[0]?.status);
                        console.log('[CampaignsContent] First campaign status value:', data.campaigns[0]?.status?.value || data.campaigns[0]?.status);
                    }
                }
                
                const campaignsToSet = data.campaigns || [];
                console.log('[CampaignsContent] Setting campaigns in state:', campaignsToSet.length);
                console.log('[CampaignsContent] Campaigns array to set:', campaignsToSet);
                setCampaigns(campaignsToSet);
                console.log('[CampaignsContent] ✅ Campaigns set in state');
            } catch (err: any) {
                console.error('[CampaignsContent] ❌ Failed to fetch campaigns');
                console.error('[CampaignsContent] Error object:', err);
                console.error('[CampaignsContent] Error message:', err.message);
                
                const errorMessage = err.details?.detail || err.message || 'Failed to load campaigns';
                console.error('[CampaignsContent] Setting error message:', errorMessage);
                setError(errorMessage);
            } finally {
                setLoading(false);
                console.log('[CampaignsContent] Loading set to false');
                console.groupEnd();
            }
        }
        fetchCampaigns();
    }, [shop]);

    const resourceName = {
        singular: 'campaign',
        plural: 'campaigns',
    };

    // Debug logging - use useEffect to track state changes
    useEffect(() => {
        console.log('[CampaignsContent] ========== State Changed ==========');
        console.log('[CampaignsContent] Campaigns state:', campaigns);
        console.log('[CampaignsContent] Campaigns length:', campaigns.length);
        console.log('[CampaignsContent] Loading state:', loading);
        console.log('[CampaignsContent] Error state:', error);
        console.log('[CampaignsContent] Campaigns array:', JSON.stringify(campaigns, null, 2));
    }, [campaigns, loading, error]);
    
    const rowMarkup = campaigns.map(
        ({ kaivo_campaign_id, shopify_product_id, status, created_at }, index) => {
            // Normalize status - handle enum objects
            const statusValue = typeof status === 'object' && status?.value ? status.value : status;
            const statusString = String(statusValue);
            
            console.log(`[CampaignsContent] Rendering row ${index}:`, {
                kaivo_campaign_id,
                shopify_product_id,
                status: statusString,
                created_at
            });
            
            return (
                <IndexTable.Row id={kaivo_campaign_id} key={kaivo_campaign_id} position={index}>
                    <IndexTable.Cell>
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                            {kaivo_campaign_id}
                        </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{shopify_product_id}</IndexTable.Cell>
                    <IndexTable.Cell>
                        <Badge tone={statusString === 'ERROR' ? 'critical' : 'success'}>{statusString}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{new Date(created_at).toLocaleDateString()}</IndexTable.Cell>
                </IndexTable.Row>
            );
        }
    );

    return (
        <Page
            title="Campaigns"
            backAction={{ content: 'Home', url: `/integrations/shopify${shop ? `?shop=${shop}` : ''}` }}
        >
            <Layout>
                <Layout.Section>
                    {error && (
                        <div style={{ marginBottom: '1rem' }}>
                            <Banner title="Error" tone="critical">
                                <p>{error}</p>
                            </Banner>
                        </div>
                    )}

                    <Card>
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                <Spinner accessibilityLabel="Loading campaigns" size="large" />
                            </div>
                        ) : campaigns.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                                <Text variant="bodyMd" as="p" tone="subdued">
                                    No campaigns found. Promote a product to get started.
                                </Text>
                            </div>
                        ) : (
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={campaigns.length}
                                headings={[
                                    { title: 'Campaign ID' },
                                    { title: 'Product ID' },
                                    { title: 'Status' },
                                    { title: 'Created At' },
                                ]}
                                selectable={false}
                            >
                                {rowMarkup}
                            </IndexTable>
                        )}
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
