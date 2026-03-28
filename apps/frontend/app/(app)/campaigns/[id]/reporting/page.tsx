"use client";

export const runtime = 'edge';

import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { ReportRecord } from '@/types/campaign';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { SpendChart } from '@/components/campaign/charts/SpendChart';
import { PerformanceChart } from '@/components/campaign/charts/PerformanceChart';
import { Loader2, DollarSign, Eye, MousePointer, TrendingUp, BarChart3 } from 'lucide-react';
import { getDemoCampaignReports, isDemoMode } from '@/lib/demoData';

export default function CampaignReportingPage({ params }: { params: { id: string } }) {
    const { data: report, isLoading, error } = useSWR<ReportRecord[]>(
        `/reports/campaign/${params.id}`,
        () => {
            if (isDemoMode()) {
                return Promise.resolve(getDemoCampaignReports(params.id));
            }
            return apiClient.get(API_ENDPOINTS.REPORTING.CAMPAIGN(params.id));
        },
        { revalidateOnFocus: false }
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 border rounded-lg bg-red-500/10 border-red-500/20">
                <h3 className="font-bold text-red-400">Failed to Load Report</h3>
                <p className="text-red-300 mt-2">{error.message || 'Unable to load reporting data'}</p>
            </div>
        );
    }

    if (!report || report.length === 0) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    <BarChart3 className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Data Yet</h3>
                    <p className="text-gray-400">
                        Reporting data will appear here once the campaign starts delivering.
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Calculate totals
    const totals = report.reduce((acc, row) => ({
        spend: acc.spend + (row.spend || 0),
        impressions: acc.impressions + (row.impressions || 0),
        clicks: acc.clicks + (row.clicks || 0),
        conversions: acc.conversions + (row.conversions || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

    const avgCPM = totals.impressions > 0 
        ? (totals.spend / totals.impressions) * 1000 
        : 0;

    const ctr = totals.impressions > 0
        ? (totals.clicks / totals.impressions) * 100
        : 0;

    const metrics = [
        {
            label: 'Total Spend',
            value: `$${totals.spend.toFixed(2)}`,
            icon: DollarSign,
            color: 'text-green-500',
        },
        {
            label: 'Total Impressions',
            value: totals.impressions.toLocaleString(),
            icon: Eye,
            color: 'text-blue-500',
        },
        {
            label: 'Total Clicks',
            value: totals.clicks.toLocaleString(),
            icon: MousePointer,
            color: 'text-purple-500',
        },
        {
            label: 'Avg CPM',
            value: `$${avgCPM.toFixed(2)}`,
            icon: TrendingUp,
            color: 'text-orange-500',
        },
        {
            label: 'CTR',
            value: `${ctr.toFixed(2)}%`,
            icon: BarChart3,
            color: 'text-pink-500',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {metrics.map((metric, index) => (
                    <Card key={index}>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-400">{metric.label}</p>
                                    <h3 className="text-xl font-bold mt-1 text-foreground">{metric.value}</h3>
                                </div>
                                <div className={`p-3 rounded-full bg-white/5 ${metric.color}`}>
                                    <metric.icon className="h-5 w-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Spend Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <SpendChart data={report} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Performance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PerformanceChart data={report} />
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Detailed Performance Data</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/5 border-b border-white/10">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Date</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-400">Platform</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-400">Impressions</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-400">Clicks</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-400">Spend</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-400">CTR</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {report.map((row, i) => {
                                    const rowCTR = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                                    return (
                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 text-foreground">
                                                {new Date(row.date).toLocaleDateString('en-US', { 
                                                    month: 'short', 
                                                    day: 'numeric' 
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-foreground capitalize">{row.platform || 'N/A'}</td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {(row.impressions || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {(row.clicks || 0).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground font-medium">
                                                ${(row.spend || 0).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-400">
                                                {rowCTR.toFixed(2)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
