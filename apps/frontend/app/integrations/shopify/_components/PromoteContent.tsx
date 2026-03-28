'use client';

import { Page, Layout, FormLayout, TextField, Select, Button, Card, Banner } from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { ResourcePicker } from '@shopify/app-bridge/actions';

import axios from 'axios';
import { useShopifyShop } from './useShopifyShop';

export const PromoteContent = () => {
    const shop = useShopifyShop();

    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    const [goal, setGoal] = useState('SALES');
    const [budget, setBudget] = useState('50');

    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [lastCampaignId, setLastCampaignId] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const app = useAppBridge();

    useEffect(() => {
        if (!app) return;
        app.error((data: any) => {
            setErrorMessage(`App Bridge error: ${data?.message || 'Unknown error'}`);
        });
    }, [app]);

    const handleSelection = async () => {
        if (!app) {
            setErrorMessage('App Bridge not ready. Please refresh the page.');
            return;
        }

        try {
            const picker = ResourcePicker.create(app, {
                resourceType: ResourcePicker.ResourceType.Product,
                options: {
                    selectMultiple: false,
                }
            });

            picker.subscribe(ResourcePicker.Action.SELECT, (payload) => {
                if (payload.selection && payload.selection.length > 0) {
                    const product = payload.selection[0];
                    setSelectedProduct({
                        id: product.id,
                        title: product.title,
                        images: product.images,
                        variants: product.variants,
                        handle: product.handle,
                        descriptionHtml: product.descriptionHtml
                    });
                    setErrorMessage('');
                }
            });

            picker.dispatch(ResourcePicker.Action.OPEN);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setErrorMessage(`Failed to open product picker: ${errorMessage}. Make sure the app has "read_products" scope.`);
        }
    };

    // Auto-dismiss success message
    useEffect(() => {
        if (status === 'success') {
            const timer = setTimeout(() => setStatus('idle'), 3000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    const handlePromote = useCallback(async () => {
        if (!shop || !selectedProduct) return;
        setStatus('submitting');
        setErrorMessage('');

        try {
            // Use proxy route instead of direct backend call
            const apiUrl = '/api/proxy/integrations/shopify';

            // Construct Normalized Product from selected resource
            // Note: In real app, we might need more data, but ResourcePicker provides enough for V1
            const normalizedProduct = {
                shopify_product_id: selectedProduct.id,
                title: selectedProduct.title,
                description_html: selectedProduct.descriptionHtml || '',
                primary_image_url: selectedProduct.images?.[0]?.originalSrc || '',
                image_urls: selectedProduct.images?.map((img: any) => img.originalSrc) || [],
                product_url: `https://${shop}/products/${selectedProduct.handle}`,
                variants: selectedProduct.variants?.map((v: any) => ({
                    variant_id: v.id,
                    price: parseFloat(v.price),
                    sku: v.sku,
                    inventory_quantity: v.inventoryQuantity
                })) || []
            };

            const payload = {
                contract_version: "input_contract_v1",
                shop_domain: shop,
                product: normalizedProduct,
                presets: {
                    goal: goal,
                    daily_budget_usd: parseFloat(budget),
                    channels: "DEFAULT_MIX"
                },
                requested_at: new Date().toISOString()
            };

            const response = await axios.post(`${apiUrl}/promote`, payload);

            if (response.data.status === 'DRAFT_CREATED' || response.data.status === 'SUBMITTED') {
                setLastCampaignId(response.data.kaivo_campaign_id);
                setStatus('success');
            } else {
                throw new Error('Unexpected status: ' + response.data.status);
            }

        } catch (err: any) {
            console.error('Promote failed', err);
            setErrorMessage(err.response?.data?.detail || err.message || 'Failed to create campaign');
            setStatus('error');
        }
    }, [shop, selectedProduct, goal, budget]);

    const goalOptions = [
        { label: 'Sales', value: 'SALES' },
        { label: 'Traffic', value: 'TRAFFIC' },
        { label: 'Awareness', value: 'AWARENESS' },
    ];

    return (
        <Page
            title="Promote Product"
            backAction={{ content: 'Home', url: `/integrations/shopify${shop ? `?shop=${shop}` : ''}` }}
        >
            <Layout>
                <Layout.Section>
                    {status === 'success' && (
                        <Banner title="Campaign created successfully" tone="success" onDismiss={() => setStatus('idle')}>
                            <p>Campaign ID: <strong>{lastCampaignId}</strong></p>
                            <p>Status: SUBMITTED</p>
                        </Banner>
                    )}
                    {status === 'error' && (
                        <Banner title="Failed to create campaign" tone="critical" onDismiss={() => setStatus('idle')}>
                            <p>{errorMessage}</p>
                        </Banner>
                    )}

                    <Card>
                        <FormLayout>
                            <Button onClick={handleSelection}>
                                {selectedProduct ? 'Change Product' : 'Select Product'}
                            </Button>

                            {selectedProduct && (
                                <div style={{ padding: '1rem', background: '#f4f6f8', borderRadius: '4px' }}>
                                    <p><strong>Selected:</strong> {selectedProduct.title}</p>
                                    <p style={{ fontSize: '0.8rem', color: '#666' }}>ID: {selectedProduct.id}</p>
                                </div>
                            )}

                            <Select
                                label="Goal"
                                options={goalOptions}
                                onChange={setGoal}
                                value={goal}
                            />
                            <TextField
                                label="Daily Budget (USD)"
                                type="number"
                                value={budget}
                                onChange={setBudget}
                                autoComplete="off"
                                prefix="$"
                            />
                            <Button
                                onClick={handlePromote}
                                loading={status === 'submitting'}
                                variant="primary"
                                disabled={!selectedProduct}
                            >
                                Promote Product
                            </Button>
                        </FormLayout>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
