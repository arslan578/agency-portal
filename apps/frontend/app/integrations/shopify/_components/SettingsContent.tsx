'use client';
import { Page, Layout, Card, Button, Banner, Text, Link, List } from '@shopify/polaris';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useShopifyShop } from './useShopifyShop';
import { useSessionToken } from './useSessionToken';
import { createShopifyEmbeddedClient } from '@/lib/api/shopifyEmbeddedClient';

export const SettingsContent = () => {
    const shop = useShopifyShop();
    const { getSessionToken, isEmbedded } = useSessionToken();

    const [status, setStatus] = useState<'connected' | 'disconnected' | 'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const apiClient = useMemo(() => {
        if (isEmbedded) {
            return createShopifyEmbeddedClient(getSessionToken);
        }
        return null;
    }, [isEmbedded, getSessionToken]);

    const checkConnection = useCallback(async () => {
        if (!shop) {
            setStatus('disconnected');
            return;
        }

        try {
            const endpoint = `/api/proxy/integrations/shopify/status?shop_domain=${encodeURIComponent(shop)}`;
            let data: any;

            if (isEmbedded && apiClient) {
                data = await apiClient.get(endpoint, { cache: 'no-store' as any });
            } else {
                const response = await fetch(endpoint, { cache: 'no-store' });
                if (!response.ok) {
                    setStatus('disconnected');
                    return;
                }
                data = await response.json();
            }

            setStatus(data?.connected === true ? 'connected' : 'disconnected');
        } catch {
            setStatus('disconnected');
        }
    }, [shop, isEmbedded, apiClient]);

    useEffect(() => {
        checkConnection();
    }, [checkConnection]);

    const handleDisconnect = async () => {
        if (!shop) return;
        setLoading(true);
        setError('');

        try {
            const apiUrl = '/api/proxy/integrations/shopify';
            const apiClient = createShopifyEmbeddedClient(getSessionToken);
            await apiClient.post(`${apiUrl}/disconnect`, {
                contract_version: "input_contract_v1",
                shop_domain: shop,
                requested_at: new Date().toISOString()
            });
            setStatus('disconnected');
        } catch (err) {
            console.error('Disconnect failed', err);
            setError('Failed to disconnect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Page title="Settings" backAction={{ content: 'Home', url: `/integrations/shopify${shop ? `?shop=${shop}` : ''}` }}>
            <Layout>
                <Layout.Section>
                    {error && (
                        <Banner title="Error" tone="critical" onDismiss={() => setError('')}>
                            <p>{error}</p>
                        </Banner>
                    )}
                    {status === 'success' && (
                        <div style={{ marginBottom: '1rem' }}>
                            <Banner title="Disconnected successfully" tone="success" onDismiss={() => setStatus('idle')}>
                                <p>The store has been disconnected.</p>
                            </Banner>
                        </div>
                    )}
                    {status === 'error' && (
                        <div style={{ marginBottom: '1rem' }}>
                            <Banner title="Disconnect failed" tone="critical" onDismiss={() => setStatus('idle')}>
                                <p>Could not disconnect store.</p>
                            </Banner>
                        </div>
                    )}

                    <Card>
                        <div style={{ padding: '1rem' }}>
                            <Text variant="headingMd" as="h2">Connection Status</Text>
                            <div style={{ marginTop: '1rem' }}>
                                {status === 'connected' ? (
                                    <Banner title="Connected" tone="success">
                                        <p>Your Shopify store is connected to Kaivo.</p>
                                    </Banner>
                                ) : (
                                    <Banner title="Disconnected" tone="warning">
                                        <p>Your Shopify store has been disconnected from Kaivo. Reinstall the app to reconnect.</p>
                                    </Banner>
                                )}
                            </div>
                            {status === 'connected' && (
                                <div style={{ marginTop: '1rem' }}>
                                    <Button tone="critical" loading={loading} onClick={handleDisconnect}>
                                        Disconnect Store
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <div style={{ padding: '1rem' }}>
                            <Text variant="headingMd" as="h2">Data Use Summary</Text>
                            <div style={{ marginTop: '1rem' }}>
                                <Text as="p" variant="bodyMd">
                                    Kaivo collects and uses the following data from your Shopify store:
                                </Text>
                                <List type="bullet">
                                    <List.Item>Store metadata (domain, installation ID) for connection management</List.Item>
                                    <List.Item>Product catalog data (title, description, images, variants, prices) for campaign creation</List.Item>
                                    <List.Item>Product updates (if enabled) to keep campaign data current</List.Item>
                                </List>
                                <div style={{ marginTop: '1rem' }}>
                                    <Text as="p" variant="bodyMd">
                                        <strong>Why we access this data:</strong> To enable product promotion campaigns and manage your store connection.
                                    </Text>
                                </div>
                                <div style={{ marginTop: '1rem' }}>
                                    <Text as="p" variant="bodyMd">
                                        <strong>Data retention:</strong> Data is retained while your store is connected. Upon uninstall, access tokens are deleted and workspace bindings are marked inactive.
                                    </Text>
                                </div>
                                <div style={{ marginTop: '1rem' }}>
                                    <Text as="p" variant="bodyMd">
                                        <strong>Uninstall cleanup:</strong> When you uninstall the app, we delete your access token, unregister webhooks, mark your workspace binding inactive, and stop all background jobs for your store. No further calls to Shopify will be made.
                                    </Text>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div style={{ padding: '1rem' }}>
                            <Text variant="headingMd" as="h2">Pricing & Tiers</Text>
                            <div style={{ marginTop: '1rem' }}>
                                <Banner title="Free Tier Available" tone="info">
                                    <p>
                                        Kaivo Shopify app is available at <strong>Tier 0 (Free)</strong> for all users. 
                                        You can promote products and create campaigns without any cost.
                                    </p>
                                </Banner>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div style={{ padding: '1rem' }}>
                            <Text variant="headingMd" as="h2">Privacy Policy</Text>
                            <div style={{ marginTop: '1rem' }}>
                                <Text as="p" variant="bodyMd">
                                    For detailed information about how we collect, use, and protect your data, please review our Privacy Policy.
                                </Text>
                                <div style={{ marginTop: '1rem' }}>
                                    <Link url="/privacy" external>
                                        View Privacy Policy
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
