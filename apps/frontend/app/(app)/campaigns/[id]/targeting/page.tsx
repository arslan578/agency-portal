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
import { AudienceEditor } from '@/components/campaign/AudienceEditor';
import { Loader2, Globe, Languages as LanguagesIcon, Target, AlertCircle, Edit } from 'lucide-react';

export default function TargetingPage({ params }: { params: { id: string } }) {
    const [isEditing, setIsEditing] = useState(false);

    const { data: campaign, isLoading: campaignLoading } = useSWR<Campaign>(
        `/campaigns/${params.id}`,
        () => apiClient.get(API_ENDPOINTS.CAMPAIGN.DETAILS(params.id)),
        { revalidateOnFocus: false }
    );

    const { data: audience, isLoading: audienceLoading, mutate: mutateAudience } = useSWR<Audience>(
        campaign?.audience_id ? `/audiences/${campaign.audience_id}` : null,
        () => apiClient.get(API_ENDPOINTS.AUDIENCE.DETAILS(campaign!.audience_id!.toString())),
        { revalidateOnFocus: false }
    );

    const handleSaveTargeting = async (definition: Audience['definition']) => {
        if (!audience) return;
        await apiClient.patch(
            API_ENDPOINTS.AUDIENCE.UPDATE(audience.id.toString()),
            { definition }
        );
        await mutateAudience();
        setIsEditing(false);
    };

    const isLoading = campaignLoading || audienceLoading;
    const canEdit = campaign?.status === 'DRAFT';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!campaign?.audience_id || !audience) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Audience Configured</h3>
                    <p className="text-gray-400">
                        This campaign does not have an audience configured. 
                        Targeting settings are defined during campaign creation.
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (isEditing && audience) {
        return (
            <div className="space-y-6">
                <AudienceEditor
                    audience={audience}
                    onSave={handleSaveTargeting}
                    onCancel={() => setIsEditing(false)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Audience Overview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Audience Overview</CardTitle>
                        {canEdit && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditing(true)}
                                className="gap-2"
                            >
                                <Edit className="h-4 w-4" />
                                Edit Targeting
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="text-xl font-bold text-foreground mb-2">{audience.name}</h3>
                        {audience.description && (
                            <p className="text-gray-400">{audience.description}</p>
                        )}
                    </div>
                    {audience.estimated_reach && (
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <p className="text-sm text-gray-400">Estimated Reach</p>
                            <p className="text-2xl font-bold text-blue-400">
                                {audience.estimated_reach.toLocaleString()}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Geographic Targeting */}
            {audience.definition?.geo && audience.definition.geo.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5" />
                            Geographic Targeting
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            {audience.definition.geo.map((country) => (
                                <Badge 
                                    key={country} 
                                    variant="info"
                                    className="text-base px-4 py-2"
                                >
                                    {country}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Languages */}
            {audience.definition?.languages && audience.definition.languages.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <LanguagesIcon className="h-5 w-5" />
                            Target Languages
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            {audience.definition.languages.map((lang) => (
                                <Badge 
                                    key={lang} 
                                    className="text-base px-4 py-2 bg-purple-500/20 text-purple-400 border-purple-500/30"
                                >
                                    {lang.toUpperCase()}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Interests */}
            {audience.definition?.interests && audience.definition.interests.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            Interests & Topics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.interests.map((interest) => (
                                <Badge 
                                    key={interest} 
                                    variant="success"
                                >
                                    {interest}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Keywords (if any) */}
            {audience.definition?.keywords && audience.definition.keywords.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Keywords</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.keywords.map((keyword) => (
                                <Badge 
                                    key={keyword} 
                                    variant="outline"
                                    className="border-gray-500/30 text-gray-300"
                                >
                                    {keyword}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Exclusions (if any) */}
            {audience.definition?.exclusions && audience.definition.exclusions.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Exclusions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.exclusions.map((exclusion) => (
                                <Badge 
                                    key={exclusion} 
                                    variant="error"
                                >
                                    {exclusion}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
