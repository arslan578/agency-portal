"use client";

export const runtime = 'edge';

import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Campaign, Audience } from '@/types/campaign';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AudienceCard } from '@/components/campaign/AudienceCard';
import { AudienceEditor } from '@/components/campaign/AudienceEditor';
import { CampaignMetrics } from '@/components/campaign/CampaignMetrics';
import { PlatformStatus } from '@/components/campaign/PlatformStatus';
import { AICreationSummary } from '@/components/campaign/AICreationSummary';
import { AICapabilitiesBanner } from '@/components/campaign/AICapabilitiesBanner';
import { PlatformAllocationsEditor } from '@/components/campaign/PlatformAllocationsEditor';
import { UMIScoreCard } from '@/components/campaign/UMIScoreCard';
import { Loader2, Calendar, User, Building, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { getDemoAudiences, getDemoCampaigns, isDemoMode } from '@/lib/demoData';

export default function CampaignOverviewPage({ params }: { params: { id: string } }) {
    const [isEditingPlatforms, setIsEditingPlatforms] = useState(false);
    const [isEditingTargeting, setIsEditingTargeting] = useState(false);

    // Fetch campaign
    const { data: campaign, error: campaignError, isLoading, mutate } = useSWR<Campaign | null>(
        `/campaigns/${params.id}`,
        () => {
            if (isDemoMode()) {
                const demoCampaign = getDemoCampaigns().find(c => c.id.toString() === params.id);
                return Promise.resolve(demoCampaign ?? null);
            }
            return apiClient.get(API_ENDPOINTS.CAMPAIGN.DETAILS(params.id));
        },
        { revalidateOnFocus: false }
    );

    // Fetch audience if campaign has audience_id
    const { data: audience, isLoading: audienceLoading, mutate: mutateAudience } = useSWR<Audience | null>(
        campaign?.audience_id ? `/audiences/${campaign.audience_id}` : null,
        () => {
            if (isDemoMode()) {
                const demoAudiences = getDemoAudiences();
                const demoAudience = demoAudiences.find(a => a.id === campaign!.audience_id);
                return Promise.resolve(demoAudience || null);
            }
            return apiClient.get(API_ENDPOINTS.AUDIENCE.DETAILS(campaign!.audience_id!.toString()));
        },
        { revalidateOnFocus: false }
    );

    const handleSaveTargeting = async (definition: Audience['definition']) => {
        if (!audience) return;
        await apiClient.patch(
            API_ENDPOINTS.AUDIENCE.UPDATE(audience.id.toString()),
            { definition }
        );
        await mutateAudience();
        setIsEditingTargeting(false);
    };

    const handleSavePlatforms = async (allocations: Record<string, number>) => {
        try {
            await apiClient.patch(
                API_ENDPOINTS.CAMPAIGN.UPDATE_PLATFORMS(params.id),
                { platform_allocations: allocations }
            );
            setIsEditingPlatforms(false);
            mutate(); // Refresh campaign data
        } catch (error: any) {
            throw new Error(error.message || 'Failed to update platform allocations');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (campaignError || !campaign) {
        return (
            <div className="p-8 border rounded-lg bg-red-500/10 border-red-500/20">
                <h3 className="font-bold text-red-400">Campaign Not Found</h3>
                <p className="text-red-300 mt-2">{campaignError?.message || 'Unable to load campaign details'}</p>
                <Button 
                    onClick={() => window.location.reload()} 
                    className="mt-4"
                    variant="outline"
                >
                    Retry
                </Button>
            </div>
        );
    }

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="space-y-6">
            {/* AI Capabilities Banner */}
            <AICapabilitiesBanner />

            {/* Campaign Metrics */}
            <CampaignMetrics campaign={campaign} />

            {/* UMI Intelligence Card */}
            {campaign.status === 'ACTIVE' && (
                <UMIScoreCard
                    campaignId={campaign.id}
                    platformAllocations={campaign.platform_allocations || {}}
                    goal={campaign.goal || 'mixed'}
                />
            )}

            {/* AI Creation Summary */}
            <AICreationSummary 
                campaign={campaign}
                audience={audience || null}
                extractedData={undefined} // TODO: Fetch from API or store in campaign metadata
                aiInsights={[]} // TODO: Fetch from API or store in campaign metadata
            />

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Campaign Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <Badge 
                                    variant={
                                        campaign.status === 'ACTIVE' ? 'success' :
                                        campaign.status === 'PAUSED' ? 'warning' :
                                        campaign.status === 'DRAFT' ? 'info' :
                                        'neutral'
                                    }
                                    className="text-lg px-4 py-2"
                                >
                                    {campaign.status}
                                </Badge>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Campaign ID:</span>
                                    <span className="text-foreground font-mono">{campaign.id}</span>
                                </div>
                                {campaign.plan_id && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Plan ID:</span>
                                        <span className="text-foreground font-mono">{campaign.plan_id}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Configuration Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <dt className="flex items-center gap-2 text-gray-400">
                                    <Building className="h-4 w-4" />
                                    Account ID:
                                </dt>
                                <dd className="text-foreground font-mono">{campaign.account_id}</dd>
                            </div>
                            {campaign.client_id && (
                                <div className="flex items-center justify-between">
                                    <dt className="flex items-center gap-2 text-gray-400">
                                        <User className="h-4 w-4" />
                                        Client ID:
                                    </dt>
                                    <dd className="text-foreground font-mono">{campaign.client_id}</dd>
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <dt className="flex items-center gap-2 text-gray-400">
                                    <Calendar className="h-4 w-4" />
                                    Created:
                                </dt>
                                <dd className="text-foreground">{formatDate(campaign.created_at)}</dd>
                            </div>
                            {campaign.updated_at && (
                                <div className="flex items-center justify-between">
                                    <dt className="flex items-center gap-2 text-gray-400">
                                        <Calendar className="h-4 w-4" />
                                        Updated:
                                    </dt>
                                    <dd className="text-foreground">{formatDate(campaign.updated_at)}</dd>
                                </div>
                            )}
                        </dl>
                    </CardContent>
                </Card>
            </div>

            {/* Audience Section */}
            {isEditingTargeting && audience ? (
                <AudienceEditor
                    audience={audience}
                    onSave={handleSaveTargeting}
                    onCancel={() => setIsEditingTargeting(false)}
                />
            ) : (
                <AudienceCard
                    audience={audience || null}
                    loading={audienceLoading}
                    onEdit={campaign.status === 'DRAFT' ? () => setIsEditingTargeting(true) : undefined}
                />
            )}

            {/* Platform Status or Editor */}
            {isEditingPlatforms && campaign.status === 'DRAFT' ? (
                <PlatformAllocationsEditor
                    currentAllocations={campaign.platform_allocations || {}}
                    totalBudgetCents={campaign.total_budget_cents}
                    onSave={handleSavePlatforms}
                    onCancel={() => setIsEditingPlatforms(false)}
                />
            ) : (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Platform Allocations</CardTitle>
                            {campaign.status === 'DRAFT' && (
                                <Button
                                    onClick={() => setIsEditingPlatforms(true)}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                >
                                    <Edit className="h-4 w-4" />
                                    Edit Platforms
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <PlatformStatus 
                            platformAllocations={campaign.platform_allocations || {}}
                            platformCampaignIds={campaign.platform_campaign_ids || {}}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}