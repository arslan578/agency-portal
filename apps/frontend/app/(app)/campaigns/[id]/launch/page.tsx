"use client";
export const runtime = 'edge';
import { useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Campaign } from '@/types/campaign';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, Clock, Play, Pause, Square, Loader2, Share2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { isDemoMode } from '@/lib/demoData';

export default function LaunchPage({ params }: { params: { id: string } }) {
    const { data: campaign, mutate, isLoading } = useSWR<Campaign>(
        `/campaigns/${params.id}`,
        () => apiClient.get(API_ENDPOINTS.CAMPAIGN.DETAILS(params.id)),
        { revalidateOnFocus: false }
    );

    const [isPublishing, setIsPublishing] = useState(false);
    const [isPausing, setIsPausing] = useState(false);
    const [isResuming, setIsResuming] = useState(false);

    const platforms = Object.keys(campaign?.platform_allocations || {});
    const isDraft = campaign?.status === 'DRAFT';
    const isActive = campaign?.status === 'ACTIVE';
    const isPaused = campaign?.status === 'PAUSED';
    const isPublished = !isDraft;

    const handlePublish = async () => {
        if (!campaign) return;
        
        setIsPublishing(true);
        try {
            if (isDemoMode()) {
                toast.success('Campaign published successfully in demo mode!');
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                await apiClient.post(API_ENDPOINTS.CAMPAIGN.LAUNCH(campaign.id.toString()), {});
            }
            toast.success('Campaign published successfully!');
            mutate();
        } catch (error: any) {
            toast.error(error.message || 'Failed to publish campaign');
        } finally {
            setIsPublishing(false);
        }
    };

    const handlePause = async () => {
        if (!campaign) return;
        
        setIsPausing(true);
        try {
            if (isDemoMode()) {
                toast.success('Campaign paused successfully in demo mode!');
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                await apiClient.post(`/campaign/campaigns/${campaign.id}/pause`, {});
            }
            toast.success('Campaign paused successfully!');
            mutate();
        } catch (error: any) {
            toast.error(error.message || 'Failed to pause campaign');
        } finally {
            setIsPausing(false);
        }
    };

    const handleResume = async () => {
        if (!campaign) return;
        
        setIsResuming(true);
        try {
            if (isDemoMode()) {
                toast.success('Campaign resumed successfully in demo mode!');
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                await apiClient.post(`/campaign/campaigns/${campaign.id}/resume`, {});
            }
            toast.success('Campaign resumed successfully!');
            mutate();
        } catch (error: any) {
            toast.error(error.message || 'Failed to resume campaign');
        } finally {
            setIsResuming(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <CardSkeleton lines={4} />
                <CardSkeleton lines={6} />
                <CardSkeleton lines={3} />
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="text-gray-400 mb-2">Campaign not found</div>
                    <Button onClick={() => window.history.back()}>Go Back</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Campaign Status Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Campaign Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold">{campaign.name}</h3>
                            <p className="text-gray-500">
                                {platforms.length} platform{platforms.length !== 1 ? 's' : ''} configured
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Badge 
                                variant={
                                    campaign.status === 'ACTIVE' ? 'success' :
                                    campaign.status === 'PAUSED' ? 'warning' :
                                    campaign.status === 'DRAFT' ? 'info' : 'neutral'
                                }
                            >
                                {campaign.status}
                            </Badge>
                            {isPublished ? (
                                <div className="flex items-center gap-2 text-green-500">
                                    <CheckCircle className="h-5 w-5" />
                                    <span className="text-sm font-medium">Published</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-gray-400">
                                    <Clock className="h-5 w-5" />
                                    <span className="text-sm font-medium">Pending</span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {isDraft && (
                            <Button 
                                onClick={handlePublish}
                                disabled={isPublishing}
                                className="flex items-center gap-2"
                            >
                                {isPublishing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Publish Campaign
                            </Button>
                        )}
                        
                        {isActive && (
                            <Button 
                                variant="secondary"
                                onClick={handlePause}
                                disabled={isPausing}
                                className="flex items-center gap-2"
                            >
                                {isPausing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Pause className="h-4 w-4" />
                                )}
                                Pause Campaign
                            </Button>
                        )}
                        
                        {isPaused && (
                            <Button 
                                onClick={handleResume}
                                disabled={isResuming}
                                className="flex items-center gap-2"
                            >
                                {isResuming ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Resume Campaign
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Platform Status */}
            <Card>
                <CardHeader>
                    <CardTitle>Platform Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {platforms.map((platform) => (
                            <div key={platform} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    <span className="font-medium capitalize">{platform}</span>
                                </div>
                                <Badge variant="success">Connected</Badge>
                            </div>
                        ))}
                        
                        {platforms.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                <Square className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No platforms configured</p>
                                <p className="text-sm">Add platforms in the campaign setup</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}