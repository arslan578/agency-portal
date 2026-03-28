"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Brain, Info, BarChart2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';

interface UMIScoreCardProps {
    platformScore?: number;
    campaignScore?: number;
    isLoading?: boolean;
}

export function UMIScoreCard({ platformScore, campaignScore, isLoading = false }: UMIScoreCardProps) {
    const [viewMode, setViewMode] = useState<'platform' | 'campaign'>('platform');

    if (isLoading) {
        return (
            <Card className="border-primary/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <span>Kaivo Intelligence (UMI Score)</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
                </CardContent>
            </Card>
        );
    }

    const displayScore = viewMode === 'platform' ? platformScore : campaignScore;
    const scoreColor = displayScore 
        ? displayScore >= 80 ? 'text-green-400' 
        : displayScore >= 60 ? 'text-yellow-400' 
        : 'text-red-400'
        : 'text-gray-400';

    return (
        <Card className="border-kaivo-teal-neon/20">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
                            <Brain className="h-5 w-5 text-primary" />
                        </div>
                        <span>Kaivo Intelligence</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">UMI Score</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'platform' | 'campaign')}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="platform">Per Platform</TabsTrigger>
                        <TabsTrigger value="campaign">Per Campaign</TabsTrigger>
                    </TabsList>

                    <TabsContent value="platform" className="space-y-4">
                        <div className="text-center">
                            <div className={cn("text-5xl font-bold mb-2", scoreColor)}>
                                {platformScore?.toFixed(1) || 'N/A'}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Average UMI Score across all platforms
                            </p>
                            <Badge className="mt-2" variant="outline">
                                Platform-level aggregation
                            </Badge>
                        </div>
                        <div className="pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                <strong>Platform Score:</strong> Calculated by analyzing performance metrics 
                                (CPM, CPC, CPA, engagement) for each advertising platform individually. 
                                Useful for comparing platform performance.
                            </p>
                        </div>
                    </TabsContent>

                    <TabsContent value="campaign" className="space-y-4">
                        <div className="text-center">
                            <div className={cn("text-5xl font-bold mb-2", scoreColor)}>
                                {campaignScore?.toFixed(1) || 'N/A'}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Average UMI Score across all campaigns
                            </p>
                            <Badge className="mt-2" variant="outline">
                                Campaign-level aggregation
                            </Badge>
                        </div>
                        <div className="pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                <strong>Campaign Score:</strong> Calculated by aggregating all platform 
                                metrics within each campaign and computing a weighted average. 
                                Useful for overall campaign health assessment.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="mt-4 pt-4 border-t border-border">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.location.href = '/intelligence'}
                    >
                        <BarChart2 className="h-4 w-4 mr-2" />
                        View Detailed Analysis
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

