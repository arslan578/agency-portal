"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { 
    Sparkles, 
    Globe, 
    Languages as LanguagesIcon, 
    Target, 
    Share2, 
    DollarSign, 
    Lightbulb,
    CheckCircle2,
} from 'lucide-react';
import { Campaign, Audience } from '@/types/campaign';

interface AICreationSummaryProps {
    campaign: Campaign;
    audience?: Audience | null;
    extractedData?: {
        campaign_name?: string;
        budget?: number;
        goal?: string;
        goal_type?: string;
        platforms?: string[];
        geo?: string[];
        languages?: string[];
        interests?: string[];
        description?: string;
    };
    aiInsights?: string[];
}

export function AICreationSummary({ 
    campaign, 
    audience, 
    extractedData,
    aiInsights = []
}: AICreationSummaryProps) {
    // Generate insights if not provided
    const insights = aiInsights.length > 0 ? aiInsights : generateInsights(campaign, audience, extractedData);

    return (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-5 w-5" />
                    AI-Powered Campaign Creation
                </CardTitle>
                <p className="text-sm text-gray-400 mt-2">
                    Your campaign was intelligently created by AI from your natural language description
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* AI Insights */}
                {insights.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <Lightbulb className="h-4 w-4 text-yellow-500" />
                            AI Intelligence Applied
                        </div>
                        <div className="space-y-1.5 pl-6">
                            {insights.map((insight, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{insight}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Extracted Data Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                    {/* Platforms */}
                    {campaign.platform_allocations && Object.keys(campaign.platform_allocations).length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                                <Share2 className="h-4 w-4" />
                                Platforms Detected
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {Object.keys(campaign.platform_allocations).map((platform) => {
                                    const allocation = campaign.platform_allocations[platform];
                                    const allocationDollars = (allocation / 100).toFixed(2);
                                    return (
                                        <Badge 
                                            key={platform}
                                            variant="info"
                                        >
                                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                            <span className="ml-2 text-xs opacity-75">${allocationDollars}</span>
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Geographic Targeting */}
                    {audience?.definition?.geo && audience.definition.geo.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                                <Globe className="h-4 w-4" />
                                Geographic Targeting
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {audience.definition.geo.map((country) => (
                                    <Badge 
                                        key={country}
                                        variant="success"
                                    >
                                        {country}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Languages */}
                    {audience?.definition?.languages && audience.definition.languages.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                                <LanguagesIcon className="h-4 w-4" />
                                Target Languages
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {audience.definition.languages.map((lang) => (
                                    <Badge 
                                        key={lang}
                                        variant="secondary"
                                        className="bg-purple-500/20 text-purple-400 border-purple-500/30"
                                    >
                                        {lang.toUpperCase()}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Interests */}
                    {audience?.definition?.interests && audience.definition.interests.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                                <Target className="h-4 w-4" />
                                Interest Targeting
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {audience.definition.interests.map((interest) => (
                                    <Badge 
                                        key={interest}
                                        variant="secondary"
                                        className="bg-orange-500/20 text-orange-400 border-orange-500/30"
                                    >
                                        {interest}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Goal */}
                    {campaign.goal && (
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                                <Target className="h-4 w-4" />
                                Campaign Goal
                            </div>
                            <Badge 
                                variant="default"
                                className="bg-primary/20 text-primary border-primary/30 capitalize"
                            >
                                {campaign.goal}
                            </Badge>
                        </div>
                    )}

                    {/* Budget */}
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-300">
                            <DollarSign className="h-4 w-4" />
                            Budget Allocated
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            ${(campaign.total_budget_cents / 100).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </div>
                    </div>
                </div>

                {/* Creation Flow Timeline */}
                <div className="pt-4 border-t border-white/10">
                    <div className="text-sm font-medium text-gray-300 mb-3">Creation Process</div>
                    <div className="space-y-2">
                        <CreationStep 
                            step={1}
                            title="AI Intent Detection"
                            description="Analyzed your message and extracted campaign requirements"
                            completed
                        />
                        <CreationStep 
                            step={2}
                            title="Audience Creation"
                            description={`Created target audience with ${audience?.definition?.geo?.length || 0} countries, ${audience?.definition?.languages?.length || 0} languages`}
                            completed={!!audience}
                        />
                        <CreationStep 
                            step={3}
                            title="Campaign Plan"
                            description={`Built campaign plan with ${Object.keys(campaign.platform_allocations || {}).length} platforms`}
                            completed={!!campaign.plan_id}
                        />
                        <CreationStep 
                            step={4}
                            title="Campaign Created"
                            description="Campaign is ready for review and launch"
                            completed={!!campaign.id}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function CreationStep({ 
    step, 
    title, 
    description, 
    completed 
}: { 
    step: number; 
    title: string; 
    description: string; 
    completed: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                completed 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-gray-500/20 text-gray-500 border border-gray-500/30'
            }`}>
                {completed ? (
                    <CheckCircle2 className="h-5 w-5" />
                ) : (
                    <span className="text-sm font-medium">{step}</span>
                )}
            </div>
            <div className="flex-1">
                <div className={`text-sm font-medium ${completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {title}
                </div>
                <div className={`text-xs mt-0.5 ${completed ? 'text-gray-400' : 'text-gray-600'}`}>
                    {description}
                </div>
            </div>
        </div>
    );
}

function generateInsights(
    campaign: Campaign,
    audience?: Audience | null,
    extractedData?: AICreationSummaryProps['extractedData']
): string[] {
    const insights: string[] = [];

    // Geographic insights
    if (audience?.definition?.geo && audience.definition.geo.length > 1) {
        insights.push(`Detected multi-country targeting: ${audience.definition.geo.join(', ')}`);
    } else if (audience?.definition?.geo && audience.definition.geo.length === 1) {
        insights.push(`Detected geographic targeting: ${audience.definition.geo[0]}`);
    }

    // Language inference
    if (audience?.definition?.languages && audience.definition.languages.length > 0) {
        const geo = audience.definition.geo || [];
        const geoStr = geo.join(',');
        if ((geoStr.includes('TH') || geoStr.includes('Thailand')) && audience.definition.languages.includes('th')) {
            insights.push('Inferred Thai language from Thailand targeting');
        }
        if (geo.includes('US') && audience.definition.languages.includes('en')) {
            insights.push('Inferred English language from US targeting');
        }
        if (audience.definition.languages.length > 1) {
            insights.push(`Detected ${audience.definition.languages.length} target languages: ${audience.definition.languages.join(', ')}`);
        }
    }

    // Interest extraction
    if (audience?.definition?.interests && audience.definition.interests.length > 0) {
        insights.push(`Extracted ${audience.definition.interests.length} interest keywords from your description`);
    }

    // Platform detection
    if (campaign.platform_allocations && Object.keys(campaign.platform_allocations).length > 1) {
        insights.push(`Detected ${Object.keys(campaign.platform_allocations).length} platforms and allocated budget proportionally`);
    } else if (campaign.platform_allocations && Object.keys(campaign.platform_allocations).length === 1) {
        const platform = Object.keys(campaign.platform_allocations)[0];
        if (platform !== "meta") {
            insights.push(`Selected ${platform} as the target platform`);
        }
    }

    // Goal inference
    if (campaign.goal && campaign.goal !== 'awareness') {
        insights.push(`Inferred campaign goal: ${campaign.goal} from your description`);
    }

    // Campaign name generation
    if (campaign.name && campaign.name.length > 10) {
        insights.push('Generated descriptive campaign name from your input');
    }

    // Budget allocation insight
    if (campaign.platform_allocations && Object.keys(campaign.platform_allocations).length > 1) {
        const budgetDollars = campaign.total_budget_cents / 100;
        insights.push(`Allocated $${budgetDollars.toFixed(2)} budget across ${Object.keys(campaign.platform_allocations).length} platforms`);
    }

    return insights;
}

