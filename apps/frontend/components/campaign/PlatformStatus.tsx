import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, XCircle, Share2 } from 'lucide-react';

interface PlatformStatusProps {
    platformAllocations: Record<string, number>;
    platformCampaignIds: Record<string, string>;
}

export function PlatformStatus({ platformAllocations, platformCampaignIds }: PlatformStatusProps) {
    const platforms = Object.keys(platformAllocations || {});

    if (platforms.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5" />
                        Platform Status
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No platforms configured
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5" />
                    Platform Status
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {platforms.map((platform) => {
                    const allocation = platformAllocations[platform];
                    const campaignId = platformCampaignIds?.[platform];
                    const isPublished = !!campaignId;
                    const allocationDollars = ((allocation || 0) / 100).toFixed(2);

                    return (
                        <div key={platform} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                            <div className="flex items-center gap-3">
                                {isPublished ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-gray-500" />
                                )}
                                <div>
                                    <h4 className="font-semibold text-foreground capitalize">{platform}</h4>
                                    <p className="text-sm text-gray-400">
                                        Budget: ${allocationDollars}
                                    </p>
                                    {isPublished && campaignId && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            ID: {campaignId}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Badge 
                                variant={isPublished ? 'success' : 'neutral'}
                            >
                                {isPublished ? 'Published' : 'Not Published'}
                            </Badge>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

