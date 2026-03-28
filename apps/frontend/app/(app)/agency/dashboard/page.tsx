'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { 
    Building2, 
    Users, 
    CreditCard, 
    TrendingUp, 
    Megaphone,
    DollarSign,
    ArrowRight,
    Plus,
    Settings
} from 'lucide-react';
import { useAgency } from '@/context/AgencyContext';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';

type DashboardApiResponse = {
    agency: { id: number; name: string; current_plan: string; credits: number; billing_status: string };
    clients_count: number;
    campaigns_count: number;
    active_campaigns_count: number;
};

export default function AgencyDashboardPage() {
    const { agency, agencyId, clients, currentClient, credits, tier, role, loading } = useAgency();
    const { user } = useAuth();
    const [dashboardData, setDashboardData] = useState<DashboardApiResponse | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);

    useEffect(() => {
        if (!agencyId) {
            setDashboardLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await apiClient.get<DashboardApiResponse>(`/agency/${agencyId}/dashboard`);
                if (!cancelled) setDashboardData(res);
            } catch (e) {
                if (!cancelled) setDashboardData(null);
            } finally {
                if (!cancelled) setDashboardLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [agencyId]);

    const tierLabels: Record<string, string> = {
        '0': 'Free Forever',
        '1': 'Starter',
        '2': 'Growth', 
        '3': 'Scale',
        '4': 'Enterprise',
        'free': 'Free Forever',
        'starter': 'Starter',
        'growth': 'Growth',
        'scale': 'Scale',
        'enterprise': 'Enterprise'
    };

    const tierColors: Record<string, string> = {
        'free': 'text-gray-400',
        'starter': 'text-blue-400',
        'growth': 'text-green-400',
        'scale': 'text-purple-400',
        'enterprise': 'text-amber-400',
        '0': 'text-gray-400',
        '1': 'text-blue-400',
        '2': 'text-green-400',
        '3': 'text-purple-400',
        '4': 'text-amber-400'
    };

    if (loading) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-muted/30 rounded w-1/3"></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-32 bg-muted/30 rounded-lg"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const displayCredits = dashboardData?.agency?.credits ?? credits;
    const displayTier = dashboardData?.agency?.current_plan ?? tier;
    const clientsCount = dashboardData?.clients_count ?? clients.length;
    const campaignsCount = dashboardData?.campaigns_count ?? 0;
    const activeCampaignsCount = dashboardData?.active_campaigns_count ?? 0;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                        <Building2 className="h-7 w-7 text-primary" />
                        {agency?.name || 'My Agency'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Welcome back, {user?.full_name || user?.email?.split('@')[0] || 'there'}
                    </p>
                </div>
                <Link href="/agency/settings">
                    <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </Button>
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Current Plan</p>
                                <p className={cn("text-2xl font-bold mt-1", tierColors[displayTier] || 'text-foreground')}>
                                    {tierLabels[displayTier] || 'Free Forever'}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-primary/10">
                                <CreditCard className="h-5 w-5 text-primary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">Ad Spend Credits</p>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1" title={`$${Number(displayCredits).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                                    {(() => {
                                        const val = Number(displayCredits);
                                        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
                                        if (val >= 1_000) return `$${(val / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
                                        return `$${val.toFixed(2)}`;
                                    })()}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-green-500/10 shrink-0">
                                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Clients / Brands</p>
                                <p className="text-2xl font-bold text-foreground mt-1">
                                    {dashboardLoading ? '—' : clientsCount}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-purple-500/10">
                                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Active Campaigns</p>
                                <p className="text-2xl font-bold text-foreground mt-1">
                                    {dashboardLoading ? '—' : activeCampaignsCount}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-primary/10">
                                <Megaphone className="h-5 w-5 text-primary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Your Role</p>
                                <p className="text-2xl font-bold text-foreground mt-1 capitalize">
                                    {role?.replace('agency_', '') || 'Admin'}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-blue-500/10">
                                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card/50 border-border">
                    <CardHeader className="border-b border-border pb-4">
                        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2.5">
                            <div className="p-1.5 rounded-md bg-purple-500/10">
                                <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            Your Clients
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {clients.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-muted-foreground mb-4">No clients yet. Create your first client to start running campaigns.</p>
                                <Link href="/agency/clients">
                                    <Button>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Client
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {clients.slice(0, 5).map(client => (
                                    <div 
                                        key={client.id} 
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                            currentClient?.id === client.id 
                                                ? "bg-primary/10 border-primary/30" 
                                                : "bg-muted/20 border-border hover:bg-accent"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                                                {client.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-foreground">{client.name}</span>
                                        </div>
                                        {currentClient?.id === client.id && (
                                            <span className="text-xs text-primary font-medium">Active</span>
                                        )}
                                    </div>
                                ))}
                                {clients.length > 5 && (
                                    <Link href="/agency/clients" className="block">
                                        <Button variant="ghost" className="w-full">
                                            View all {clients.length} clients
                                            <ArrowRight className="h-4 w-4 ml-2" />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardHeader className="border-b border-border pb-4">
                        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2.5">
                            <div className="p-1.5 rounded-md bg-primary/10">
                                <Megaphone className="h-4 w-4 text-primary" />
                            </div>
                            Quick Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                        <Link href="/plans/new" className="block">
                            <Button variant="outline" className="w-full justify-start">
                                <Plus className="h-4 w-4 mr-3" />
                                Create New Campaign
                                <ArrowRight className="h-4 w-4 ml-auto" />
                            </Button>
                        </Link>
                        <Link href="/audiences" className="block">
                            <Button variant="outline" className="w-full justify-start">
                                <Users className="h-4 w-4 mr-3" />
                                Manage Audiences
                                <ArrowRight className="h-4 w-4 ml-auto" />
                            </Button>
                        </Link>
                        <Link href="/billing" className="block">
                            <Button variant="outline" className="w-full justify-start">
                                <CreditCard className="h-4 w-4 mr-3" />
                                Add Credits / Upgrade Plan
                                <ArrowRight className="h-4 w-4 ml-auto" />
                            </Button>
                        </Link>
                        <Link href="/agency/settings" className="block">
                            <Button variant="outline" className="w-full justify-start">
                                <Settings className="h-4 w-4 mr-3" />
                                Invite Team Members
                                <ArrowRight className="h-4 w-4 ml-auto" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
