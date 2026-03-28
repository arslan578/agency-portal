'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { buttonVariants } from '@/components/ui/Button';
import { Plus, Search, Filter, MoreHorizontal, TrendingUp, Calendar, DollarSign, BarChart2, Pause, Square, Play, Copy, Loader2, Megaphone } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { asArray } from '@/lib/types/asArray';
import { ReportRecord } from '@/types/campaign';
import { IntelligenceInput, PlatformScore } from '@/types/intelligence';
import { UMIBadge } from '@/components/intelligence/UMIBadge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { ErrorDisplay } from '@/components/ui/ErrorDisplay';
import { MobileTable } from '@/components/ui/MobileTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { AdvancedFilter, FilterOption, FilterValue } from '@/components/ui/AdvancedFilter';
import { FilterChips } from '@/components/ui/FilterChips';
import { useFilters } from '@/hooks/useFilters';
import { toast } from 'sonner';
import { getDemoCampaigns, getDemoCampaignReports, isDemoMode } from '@/lib/demoData';

export default function CampaignsPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [reportingData, setReportingData] = useState<Record<number, ReportRecord[]>>({});
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [campaignUMIScores, setCampaignUMIScores] = useState<Record<number, number>>({});
    
    const filterOptions: FilterOption[] = [
        { key: 'status', label: 'Status', type: 'select', options: [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'PAUSED', label: 'Paused' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'COMPLETED', label: 'Completed' }
        ]},
        { key: 'platform', label: 'Platform', type: 'select', options: [
            { value: 'meta', label: 'Meta' },
            { value: 'google_ads', label: 'Google Ads' }
        ]}
    ];
    
    const { filters, updateFilter, removeFilter, clearAll, applyPreset, setFilters } = useFilters();
    const filterLabels: Record<string, string> = {
        status: 'Status',
        platform: 'Platform'
    };
    
    const handleFilterChange = (values: FilterValue) => {
        setFilters(values);
    };
    
    const handlePresetSelect = (preset: FilterValue) => {
        setFilters(preset);
    };

    useEffect(() => {
        fetchCampaigns();
    }, []);

    useEffect(() => {
        if (campaigns.length > 0) {
            fetchAllReportingData();
            fetchAllUMIScores();
        }
    }, [campaigns]);

    const fetchCampaigns = async () => {
        try {
            setError(null);
            if (isDemoMode()) {
                setCampaigns(getDemoCampaigns());
                return;
            }
            const data = await apiClient.get<any[]>(API_ENDPOINTS.CAMPAIGN.LIST);
            setCampaigns(asArray(data));
        } catch (error: any) {
            console.error('Failed to fetch campaigns:', error);
            setCampaigns([]);
            setError(error.message || 'Service unavailable');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllReportingData = async () => {
        setMetricsLoading(true);
        try {
            if (isDemoMode()) {
                const reportingMap: Record<number, ReportRecord[]> = {};
                campaigns.forEach(campaign => {
                    reportingMap[campaign.id] = getDemoCampaignReports(campaign.id);
                });
                setReportingData(reportingMap);
                return;
            }

            const reportingPromises = campaigns.map(async (campaign) => {
                try {
                    const report = await apiClient.get<ReportRecord[]>(
                        API_ENDPOINTS.REPORTING.CAMPAIGN(campaign.id.toString())
                    );
                    return { campaignId: campaign.id, data: asArray(report) };
                } catch (error) {
                    console.error(`Failed to fetch reporting for campaign ${campaign.id}:`, error);
                    return { campaignId: campaign.id, data: [] };
                }
            });

            const results = await Promise.all(reportingPromises);
            const reportingMap: Record<number, ReportRecord[]> = {};
            results.forEach(({ campaignId, data }) => {
                reportingMap[campaignId] = data as ReportRecord[];
            });
            setReportingData(reportingMap);
        } catch (error) {
            console.error('Failed to fetch reporting data:', error);
        } finally {
            setMetricsLoading(false);
        }
    };

    const fetchAllUMIScores = async () => {
        const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE' || c.status === 'active');
        if (activeCampaigns.length === 0) return;

        try {
            const umiPromises = activeCampaigns.map(async (campaign) => {
                try {
                    const reportData = await apiClient.get<ReportRecord[]>(
                        API_ENDPOINTS.REPORTING.CAMPAIGN(campaign.id.toString())
                    ).catch(() => []);

                    if (!reportData || reportData.length === 0) {
                        return { campaignId: campaign.id, score: null };
                    }

                    // Aggregate metrics by platform
                    const platformMetrics: Record<string, {
                        impressions: number;
                        clicks: number;
                        conversions: number;
                        spend: number;
                        reach: number;
                        views: number;
                    }> = {};

                    (asArray(reportData) as ReportRecord[]).forEach((record) => {
                        const platform = record.platform || 'unknown';
                        if (!platformMetrics[platform]) {
                            platformMetrics[platform] = {
                                impressions: 0,
                                clicks: 0,
                                conversions: 0,
                                spend: 0,
                                reach: 0,
                                views: 0,
                            };
                        }
                        platformMetrics[platform].impressions += record.impressions || 0;
                        platformMetrics[platform].clicks += record.clicks || 0;
                        platformMetrics[platform].conversions += record.conversions || 0;
                        platformMetrics[platform].spend += record.spend || 0;
                        platformMetrics[platform].reach += record.impressions || 0; // Estimate
                        platformMetrics[platform].views += record.impressions || 0; // Estimate
                    });

                    // Create IntelligenceInput for each platform
                    const inputs: IntelligenceInput[] = Object.entries(platformMetrics).map(([platform, metrics]) => {
                        const impressions = metrics.impressions || 0;
                        const clicks = metrics.clicks || 0;
                        const spend = metrics.spend || 0;

                        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
                        const cpc = clicks > 0 ? spend / clicks : 0;
                        const cpa = metrics.conversions > 0 ? spend / metrics.conversions : 0;
                        const frequency = metrics.reach > 0 ? impressions / metrics.reach : 0;

                        // Map platform to category
                        const lower = platform.toLowerCase();
                        let category: IntelligenceInput['category'] = 'social';
                        if (lower.includes('google') || lower.includes('display')) {
                            category = 'display_search';
                        } else if (lower.includes('roku') || lower.includes('youtube') || lower.includes('streaming')) {
                            category = 'streaming_tv';
                        } else if (lower.includes('audio') || lower.includes('podcast') || lower.includes('spotify')) {
                            category = 'audio_video';
                        }

                        // Map goal
                        const goalStr = campaign.goal?.toLowerCase() || '';
                        let goal: IntelligenceInput['goal'] = 'mixed';
                        if (goalStr.includes('awareness') || goalStr.includes('reach')) {
                            goal = 'awareness';
                        } else if (goalStr.includes('traffic') || goalStr.includes('click')) {
                            goal = 'traffic';
                        } else if (goalStr.includes('conversion') || goalStr.includes('sale') || goalStr.includes('lead')) {
                            goal = 'conversions';
                        }

                        return {
                            platform,
                            category,
                            goal,
                            metrics: {
                                impressions,
                                clicks,
                                conversions: metrics.conversions,
                                spend,
                                cpm,
                                cpa,
                                reach: metrics.reach,
                                views: metrics.views,
                                frequency,
                                cpc,
                                completions: 0,
                            },
                        };
                    });

                    if (inputs.length === 0) {
                        return { campaignId: campaign.id, score: null };
                    }

                    // Call intelligence API
                    const platformScores = await apiClient.post<PlatformScore[]>(
                        API_ENDPOINTS.INTELLIGENCE.ANALYZE,
                        inputs
                    );

                    if (platformScores.length === 0) {
                        return { campaignId: campaign.id, score: null };
                    }

                    // Aggregate score (weighted by platform allocation if available)
                    const allocations = campaign.platform_allocations || {};
                    let totalScore = 0;
                    let totalWeight = 0;

                    platformScores.forEach((score) => {
                        const weight = allocations[score.platform] || 1;
                        totalScore += score.umi_score * weight;
                        totalWeight += weight;
                    });

                    const aggregatedScore = totalWeight > 0 ? totalScore / totalWeight : platformScores[0].umi_score;
                    return { campaignId: campaign.id, score: aggregatedScore };
                } catch (error) {
                    console.error(`Failed to fetch UMI for campaign ${campaign.id}:`, error);
                    return { campaignId: campaign.id, score: null };
                }
            });

            const results = await Promise.all(umiPromises);
            const umiMap: Record<number, number> = {};
            results.forEach(({ campaignId, score }) => {
                if (score !== null) {
                    umiMap[campaignId] = score;
                }
            });
            setCampaignUMIScores(umiMap);
        } catch (error) {
            console.error('Failed to fetch UMI scores:', error);
        }
    };

    const handleAction = async (action: string, campaignId: number) => {
        // ... (existing action handler) ...
        setActionLoading(campaignId);
        setOpenMenuId(null);

        try {
            // AUTHORITATIVE ENDPOINTS: POST /api/campaign/campaigns/{id}/{action} where action in [start, pause, stop, duplicate]
            const endpoint = `${API_ENDPOINTS.CAMPAIGN.DETAILS(campaignId.toString())}/${action.toLowerCase()}`;

            // Duplicate returns a new campaign, others might return updated status
            const res = await apiClient.post<any>(endpoint, {});

            if (action === 'Duplicate') {
                // Add new campaign to list
                setCampaigns([res, ...campaigns]);
                toast.success(`Campaign duplicated successfully! ID: ${res.id}`);
            } else {
                // Update existing campaign in list
                setCampaigns(campaigns.map(c =>
                    c.id === campaignId ? { ...c, status: res.status || action.toLowerCase() } : c
                ));
            }
        } catch (error: any) {
            console.error(`${action} failed:`, error);
            toast.error(`Failed to ${action.toLowerCase()} campaign: ${error.message || 'Unknown error'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCreateNew = () => {
        router.push('/plans/new');
    };

    // Filter campaigns by search query
    const filteredCampaigns = useMemo(() => {
        let result = campaigns;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(campaign =>
                campaign.name?.toLowerCase().includes(query) ||
                campaign.id?.toString().includes(query)
            );
        }

        if (filters.status) {
            result = result.filter(c => 
                c.status?.toUpperCase() === (filters.status as string).toUpperCase()
            );
        }

        if (filters.platform) {
            result = result.filter(c => {
                const platforms = Object.keys(c.platform_allocations || {});
                return platforms.some(p => 
                    p.toLowerCase() === (filters.platform as string).toLowerCase()
                );
            });
        }

        return result;
    }, [campaigns, searchQuery, filters]);

    // Calculate metrics from campaigns and reporting data
    const metrics = useMemo(() => {
        // Total Active: Count campaigns with ACTIVE status
        const totalActive = campaigns.filter(c => c.status === 'ACTIVE').length;

        let totalSpend = 0;
        let totalImpressions = 0;
        Object.values(reportingData).forEach((records) => {
            records.forEach((record) => {
                totalSpend += record.spend || 0;
                totalImpressions += record.impressions || 0;
            });
        });

        const avgCPM = totalImpressions > 0 
            ? (totalSpend / totalImpressions) * 1000 
            : 0;

        const upcoming = campaigns.filter(c => c.status === 'DRAFT').length;

        return {
            totalActive,
            totalSpend,
            avgCPM,
            upcoming
        };
    }, [campaigns, reportingData]);

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Campaigns</h1>
                    <p className="text-gray-400 mt-1">Manage and optimize your active campaigns</p>
                </div>
                <button className={cn(buttonVariants(), "gap-2")} onClick={handleCreateNew}>
                    <Plus className="h-4 w-4" />
                    Create New
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <ErrorDisplay
                    error={error}
                    title="Failed to load campaigns"
                    onRetry={fetchCampaigns}
                    className="mb-8"
                />
            )}

            {/* Stats Overview - Guarded against empty array */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {loading ? (
                    <>
                        <CardSkeleton lines={1} />
                        <CardSkeleton lines={1} />
                        <CardSkeleton lines={1} />
                        <CardSkeleton lines={1} />
                    </>
                ) : (
                [
                    { 
                        label: 'Total Active', 
                        value: metricsLoading ? '...' : metrics.totalActive.toString(), 
                        icon: TrendingUp, 
                        color: 'text-green-500' 
                    },
                    { 
                        label: 'Total Spend', 
                        value: metricsLoading ? '...' : `$${metrics.totalSpend.toFixed(2)}`, 
                        icon: DollarSign, 
                        color: 'text-blue-500' 
                    },
                    { 
                        label: 'Avg. CPM', 
                        value: metricsLoading ? '...' : metrics.avgCPM > 0 ? `$${metrics.avgCPM.toFixed(2)}` : '-', 
                        icon: BarChart2, 
                        color: 'text-purple-500' 
                    },
                    { 
                        label: 'Upcoming', 
                        value: metricsLoading ? '...' : metrics.upcoming.toString(), 
                        icon: Calendar, 
                        color: 'text-orange-500' 
                    }
                ].map((stat, i) => (
                    <Card key={i}>
                        <CardContent className="p-8 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-400">{stat.label}</p>
                                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                            </div>
                            <div className={`p-3 rounded-full bg-muted/50 ${stat.color}`}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                        </CardContent>
                    </Card>
                ))
                )}
            </div>

            {/* Filters */}
            <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search campaigns..." 
                            className="pl-9" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Search campaigns"
                        />
                    </div>
                    <AdvancedFilter
                        options={filterOptions}
                        values={filters}
                        onChange={handleFilterChange}
                        onReset={clearAll}
                        onPresetSelect={handlePresetSelect}
                    />
                </div>
                <FilterChips
                    filters={filters}
                    filterLabels={filterLabels}
                    onRemove={removeFilter}
                    onClearAll={clearAll}
                />
            </div>

            {/* Campaigns Table */}
            {loading ? (
                <TableSkeleton rows={5} columns={5} />
            ) : (
            <>
                {/* Mobile View */}
                <div className="block md:hidden">
                    {filteredCampaigns.length === 0 ? (
                        <EmptyState
                            icon={Megaphone}
                            title="No campaigns found"
                            description={searchQuery ? 'No campaigns match your search criteria.' : 'Get started by creating your first campaign.'}
                            action={{
                                label: "Create Campaign",
                                onClick: () => router.push('/plans/new')
                            }}
                        />
                    ) : (
                    <MobileTable
                        data={filteredCampaigns}
                        columns={[
                            {
                                key: 'name',
                                label: 'Campaign',
                                render: (campaign) => (
                                    <div>
                                        <Link href={`/campaigns/${campaign.id}`} className="font-medium text-foreground hover:underline">
                                            {campaign.name || `Campaign ${campaign.id}`}
                                        </Link>
                                        {(campaign.status === 'ACTIVE' || campaign.status === 'active') && campaignUMIScores[campaign.id] && (
                                            <UMIBadge 
                                                score={campaignUMIScores[campaign.id]} 
                                                size="sm" 
                                                showLabel={true}
                                                className="ml-1 mt-1"
                                            />
                                        )}
                                    </div>
                                )
                            },
                            {
                                key: 'status',
                                label: 'Status',
                                render: (campaign) => (
                                    <Badge
                                        variant={
                                            campaign.status === 'ACTIVE' || campaign.status === 'active' ? 'success' :
                                            campaign.status === 'PAUSED' || campaign.status === 'paused' ? 'warning' :
                                            campaign.status === 'COMPLETED' || campaign.status === 'completed' ? 'neutral' :
                                            'info'
                                        }
                                    >
                                        {campaign.status ? (campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1).toLowerCase()) : 'Unknown'}
                                    </Badge>
                                )
                            },
                            {
                                key: 'budget',
                                label: 'Budget',
                                render: (campaign) => campaign.total_budget_cents ? `$${(campaign.total_budget_cents / 100).toFixed(2)}` : '-'
                            },
                            {
                                key: 'actions',
                                label: 'Actions',
                                render: (campaign) => (
                                    <Link 
                                        href={`/campaigns/${campaign.id}`}
                                        className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "text-foreground")}
                                    >
                                        View
                                    </Link>
                                )
                            }
                        ]}
                    />
                    )}
                </div>

                {/* Desktop View */}
                <Card className="hidden md:block">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-medium text-gray-400">Campaign Name</th>
                                <th className="px-6 py-4 font-medium text-gray-400">Status</th>
                                <th className="px-6 py-4 font-medium text-gray-400">Budget</th>
                                <th className="px-6 py-4 font-medium text-gray-400">Performance</th>
                                <th className="px-6 py-4 font-medium text-right text-gray-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {filteredCampaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8">
                                        <EmptyState
                                            icon={Megaphone}
                                            title="No campaigns found"
                                            description={searchQuery ? 'No campaigns match your search criteria.' : 'Get started by creating your first campaign.'}
                                            action={{
                                                label: "Create Campaign",
                                                onClick: () => router.push('/plans/new')
                                            }}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filteredCampaigns.map((campaign, i) => (
                                    <tr key={campaign.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Link href={`/campaigns/${campaign.id}`} className="font-medium text-foreground hover:underline">
                                                    {campaign.name || `Campaign ${campaign.id}`}
                                                </Link>
                                                {(campaign.status === 'ACTIVE' || campaign.status === 'active') && campaignUMIScores[campaign.id] && (
                                                    <UMIBadge 
                                                        score={campaignUMIScores[campaign.id]} 
                                                        size="sm" 
                                                        showLabel={true}
                                                        className="ml-1"
                                                    />
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">ID: {campaign.id}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge
                                                variant={
                                                    campaign.status === 'ACTIVE' || campaign.status === 'active' ? 'success' :
                                                    campaign.status === 'PAUSED' || campaign.status === 'paused' ? 'warning' :
                                                    campaign.status === 'COMPLETED' || campaign.status === 'completed' ? 'neutral' :
                                                    'info'
                                                }
                                            >
                                                {campaign.status ? (campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1).toLowerCase()) : 'Unknown'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-foreground">
                                            {campaign.total_budget_cents ? `$${(campaign.total_budget_cents / 100).toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Link 
                                                href={`/campaigns/${campaign.id}/reporting`}
                                                className="text-xs text-primary hover:underline font-medium transition-colors"
                                            >
                                                View Report →
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="relative inline-block">
                                                <button
                                                    className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-gray-400 hover:text-foreground hover:bg-accent")}
                                                    onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                                                    disabled={actionLoading === campaign.id}
                                                >
                                                    {actionLoading === campaign.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    )}
                                                </button>

                                                {/* Dropdown Menu */}
                                                {openMenuId === campaign.id && (
                                                    <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
                                                        <button
                                                            onClick={() => handleAction('Start', campaign.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-accent flex items-center gap-2 rounded-t-lg"
                                                            disabled={campaign.status === 'ACTIVE' || campaign.status === 'active' || campaign.status === 'running'}
                                                        >
                                                            <Play className="w-4 h-4 text-green-500" />
                                                            Start
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction('Pause', campaign.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-accent flex items-center gap-2"
                                                            disabled={campaign.status === 'PAUSED' || campaign.status === 'paused'}
                                                        >
                                                            <Pause className="w-4 h-4 text-yellow-500" />
                                                            Pause
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction('Stop', campaign.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-accent flex items-center gap-2"
                                                            disabled={campaign.status === 'COMPLETED' || campaign.status === 'completed' || campaign.status === 'stopped'}
                                                        >
                                                            <Square className="w-4 h-4 text-red-500" />
                                                            Stop
                                                        </button>
                                                        <div className="border-t border-border"></div>
                                                        <button
                                                            onClick={() => handleAction('Duplicate', campaign.id)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-accent flex items-center gap-2 rounded-b-lg"
                                                        >
                                                            <Copy className="w-4 h-4 text-blue-500" />
                                                            Duplicate
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            </>
            )}
        </div>
    );
}
