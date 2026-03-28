'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loader2, Calendar } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { getDemoCampaigns, getDemoCampaignReports, isDemoMode } from '@/lib/demoData';

export default function ReportingPage() {
    // 1. Fetch List of Campaigns to populate Selector
    // 1. Fetch List of Campaigns to populate Selector
    // FIX: Disable retries to prevent infinite loading on 500s
    const swrConfig = {
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        errorRetryCount: 0
    };

    const { data: rawCampaigns, error: campaignsError, mutate: retryCampaigns } = useSWR(
        '/campaigns',
        () => {
            if (isDemoMode()) {
                return Promise.resolve(getDemoCampaigns());
            }
            return apiClient.get<any[]>(API_ENDPOINTS.CAMPAIGN.LIST);
        },
        swrConfig
    );
    // Safe cast
    const campaigns = React.useMemo(() => rawCampaigns ? rawCampaigns : [], [rawCampaigns]);

    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

    // Default to first campaign if none selected
    React.useEffect(() => {
        if (campaigns && campaigns.length > 0 && !selectedCampaignId) {
            setSelectedCampaignId(campaigns[0].id.toString());
        }
    }, [campaigns, selectedCampaignId]);

    // 2. Fetch Report Data for Selected Campaign
    const { data: rawReportData, isLoading: isLoadingReport, error: reportError, mutate: retryReport } = useSWR(
        selectedCampaignId ? `/reports/campaign/${selectedCampaignId}` : null,
        () => {
            if (isDemoMode()) {
                return Promise.resolve(getDemoCampaignReports(selectedCampaignId));
            }
            return apiClient.get<any[]>(API_ENDPOINTS.REPORTING.CAMPAIGN(selectedCampaignId));
        },
        swrConfig
    );
    // Map backend fields to frontend expected format
    const reportData = React.useMemo(() => {
        if (!rawReportData) return [];
        return rawReportData.map((record: any) => ({
            ...record,
            spend: record.spend || record.spend_agency || 0,  // Map spend_agency to spend
            conversions: record.conversions || 0  // Default conversions to 0 if missing
        }));
    }, [rawReportData]);

    // FIX: Handle Errors First
    if (campaignsError) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg flex flex-col gap-2 items-start">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="font-semibold">Reporting is temporarily unavailable.</span>
                    </div>
                    <p className="text-sm opacity-80 pl-4">{campaignsError.message || 'Service unavailable'}.</p>
                    <Button
                        variant="outline"
                        className="ml-4 mt-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => retryCampaigns()}
                    >
                        Retry Connection
                    </Button>
                </div>
            </div>
        );
    }

    if (!rawCampaigns && !campaignsError) {
        return (
            <div className="p-8 max-w-7xl mx-auto space-y-6">
                <CardSkeleton lines={3} />
                <CardSkeleton lines={4} />
            </div>
        );
    }

    if (!rawCampaigns) {
        return (
            <div className="p-8 max-w-7xl mx-auto space-y-6">
                <CardSkeleton lines={3} />
                <CardSkeleton lines={4} />
            </div>
        );
    }


    const currentCampaign = campaigns.find(c => c.id.toString() === selectedCampaignId);

    // Derived Metrics from Report Data
    // reportData is guaranteed array by useMemo above
    const totalImpressions = reportData.reduce((acc: number, row: any) => acc + (row.impressions || 0), 0) || 0;
    const totalSpend = reportData.reduce((acc: number, row: any) => acc + (row.spend || 0), 0) || 0;
    const totalConversions = reportData.reduce((acc: number, row: any) => acc + (row.conversions || 0), 0) || 0;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Campaign Reporting</h1>
                    <p className="text-muted-foreground">Deep dive into your campaign metrics.</p>
                </div>
                <div className="flex gap-4">
                    <select
                        className="bg-muted/30 border border-border rounded-md px-4 py-2 text-foreground"
                        value={selectedCampaignId}
                        onChange={(e) => setSelectedCampaignId(e.target.value)}
                    >
                        {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Impressions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalImpressions.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Conversions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalConversions.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            {reportData.length === 0 && !isLoadingReport ? (
                <EmptyState
                    icon={BarChart2}
                    title="No reporting data available"
                    description="Reporting data will appear here once your campaign starts generating metrics."
                />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                    <h3 className="text-lg font-bold mb-4">Impressions Over Time</h3>
                    <div className="h-[300px] w-full">
                        {isLoadingReport ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : reportData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                No data available
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={reportData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="date" stroke="#888" />
                                    <YAxis stroke="#888" />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                                        formatter={(value: any) => [value.toLocaleString(), 'Impressions']}
                                        labelFormatter={(label) => `Date: ${label}`}
                                    />
                                    <Line type="monotone" dataKey="impressions" stroke="#4ade80" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-bold mb-4">Spend vs Conversions</h3>
                    <div className="h-[300px] w-full">
                        {isLoadingReport ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : reportData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                No data available
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reportData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="date" stroke="#888" />
                                    <YAxis yAxisId="left" stroke="#888" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#888" />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                                        formatter={(value: any, name: string) => {
                                            if (name === 'Spend ($)') {
                                                return [`$${value.toFixed(2)}`, 'Spend'];
                                            }
                                            return [value, name];
                                        }}
                                        labelFormatter={(label) => `Date: ${label}`}
                                    />
                                    <Bar yAxisId="left" dataKey="spend" fill="#8884d8" name="Spend ($)" />
                                    <Bar yAxisId="right" dataKey="conversions" fill="#82ca9d" name="Conversions" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>
            </div>
            )}

            {/* Detailed Data Table */}
            <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-foreground">Daily Breakdown</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted/30 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Platform</th>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Impressions</th>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Clicks</th>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Spend</th>
                                <th className="px-6 py-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Conversions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {reportData?.map((row: any, i: number) => {
                                const date = new Date(row.date);
                                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                return (
                                    <tr key={i} className="hover:bg-accent transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-foreground font-medium">{formattedDate}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="info" className="capitalize">
                                                {row.platform}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-foreground font-medium">{row.impressions?.toLocaleString() || '0'}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-foreground font-medium">{row.clicks?.toLocaleString() || '0'}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-foreground font-semibold">${(row.spend || 0).toFixed(2)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-foreground font-medium">{row.conversions || 0}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {(!reportData || reportData.length === 0) && !isLoadingReport && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="text-muted-foreground text-sm">No data available for this campaign period.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
