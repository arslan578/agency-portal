'use client'

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { Check, CreditCard, Zap, ChevronRight, Star, Calendar, TrendingUp, Settings, Monitor, BarChart3, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { toast } from 'sonner';
import { useAgency } from '@/context/AgencyContext';

const PRICING_TIERS = [
    {
        id: "free",
        name: "Free Forever",
        price: 0,
        minSpend: 0,
        maxSpend: 1000,
        description: "Growth engine + CAC reduction. Creates your 'Shopify Starter / Mailchimp Free' effect.",
        features: [
            "Up to $1,000/month ad spend",
            "$0 platform fee",
            "Kaivo-managed accounts only",
            "Basic routing",
            "Basic reporting",
            "Creative checks",
            "1 brand only",
            "English only",
            "Limited variants",
            "Revenue: CPM spread only"
        ],
        excluded: [
            "No tracking integrations",
            "No budget optimizer",
            "No multilingual",
            "No custom rules"
        ]
    },
    {
        id: "starter",
        name: "Starter",
        price: 99,
        minSpend: 1000,
        maxSpend: 5000,
        stripePriceId: "price_1StsXNLRKEAKKmcBHF5OruGP",
        description: "For growing businesses ready to scale their ad operations.",
        features: [
            "$1,000–$5,000/month ad spend",
            "$99/month platform fee",
            "Kaivo-managed or user-owned accounts",
            "Creative scoring",
            "Multilingual",
            "Reporting dashboard",
            "Saved audiences",
            "Weekly summaries",
            "Revenue: Platform fee + CPM spread"
        ],
        excluded: []
    },
    {
        id: "growth",
        name: "Growth",
        price: 199,
        minSpend: 5000,
        maxSpend: 15000,
        popular: true,
        stripePriceId: "price_1StsZKLRKEAKKmcBJsrgMLai",
        description: "Our most popular plan for businesses scaling rapidly.",
        features: [
            "$5,000–$15,000/month ad spend",
            "$199/month platform fee",
            "Everything in Starter",
            "Budget optimizer",
            "Cross-platform rules",
            "Real-time routing",
            "Variant scoring",
            "Advanced reporting"
        ],
        excluded: []
    },
    {
        id: "scale",
        name: "Scale",
        price: 399,
        minSpend: 15000,
        maxSpend: 50000,
        stripePriceId: "price_1StsZWLRKEAKKmcBgIb2vdtH",
        description: "Advanced tools and support for high-volume advertisers.",
        features: [
            "$15,000–$50,000/month ad spend",
            "$399/month platform fee",
            "Everything in Growth",
            "Unlimited brands",
            "Unlimited variants",
            "Workspaces",
            "White-label reporting",
            "API access (restricted)"
        ],
        excluded: []
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: "5% of spend",
        minSpend: 50000,
        maxSpend: null,
        stripePriceId: "price_1StsaPLRKEAKKmcBOYy6pX0L",
        description: "Custom solutions for large-scale organizations.",
        features: [
            "$50,000+/month ad spend",
            "5% of total ad spend fee",
            "User-owned accounts only",
            "Everything in Scale",
            "Full Kaivo Intelligence",
            "Advanced permissions",
            "Enterprise routing",
            "Team access",
            "Priority support",
            "Audit logs",
            "Onboarding concierge"
        ],
        excluded: []
    }
];

interface Transaction {
    id: number;
    agency_id: number;
    amount: number;
    transaction_type: string;
    description: string;
    created_at: string;
    stripe_payment_id?: string | null;
}

interface SubscriptionDetails {
    plan_id: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
}

export default function BillingPage() {
    const { agencyId, credits: agencyCredits, tier, currentClient } = useAgency();
    const [credits, setCredits] = useState<number>(0);
    const [selectedAmount, setSelectedAmount] = useState(500);
    const [customAmount, setCustomAmount] = useState('');
    const [isCustom, setIsCustom] = useState(false);

    const [currentPlanId, setCurrentPlanId] = useState('free');
    const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
    const [viewPlanId, setViewPlanId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [billingSummary, setBillingSummary] = useState<{
        kaivo_managed_count: number;
        reporting_only_count: number;
        total_clients: number;
        kaivo_managed_clients: { id: number; name: string }[];
        reporting_only_clients: { id: number; name: string }[];
    } | null>(null);

    const fetchCurrentSubscription = async () => {
        if (!agencyId) return;
        try {
            const res = await apiClient.get<any>(`/billing/subscription/${agencyId}`);
            if (res && res.plan_id) {
                setCurrentPlanId(res.plan_id.toLowerCase());
                setSubscriptionDetails({
                    plan_id: res.plan_id,
                    status: res.status || 'active',
                    current_period_end: res.current_period_end || null,
                    cancel_at_period_end: res.cancel_at_period_end || false
                });
            }
        } catch (e: any) {
            // 404 is expected for free tier users
        }
    };

    useEffect(() => {
        const fetchBalance = async () => {
            if (!agencyId) return;
            try {
                const res = await apiClient.get<any>(`${API_ENDPOINTS.BILLING.BALANCE}?agency_id=${agencyId}`);
                const creditValue = typeof res === 'number' ? res : parseFloat(res?.credits) || 0;
                setCredits(creditValue);
            } catch (e) {
                console.error('Failed to fetch balance', e);
            }
        };
        fetchBalance();

        const fetchTransactions = async () => {
            if (!agencyId) return;
            try {
                setLoadingTransactions(true);
                const res = await apiClient.get<Transaction[]>(`${API_ENDPOINTS.BILLING.TRANSACTIONS}?agency_id=${agencyId}&limit=50`);
                setTransactions(Array.isArray(res) ? res : []);
            } catch (e) {
                console.error('Failed to fetch transactions', e);
                toast.error('Failed to load transaction history');
            } finally {
                setLoadingTransactions(false);
            }
        };
        fetchTransactions();

        fetchCurrentSubscription();

        const fetchBillingSummary = async () => {
            if (!agencyId) return;
            try {
                const res = await apiClient.get<any>(API_ENDPOINTS.BILLING.AGENCY_BILLING_SUMMARY(agencyId));
                setBillingSummary(res);
            } catch (e) {
                console.error('Failed to fetch billing summary', e);
            }
        };
        fetchBillingSummary();

        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const mode = params.get('mode');
        if (sessionId) {
            if (mode === 'subscription') {
                confirmSubscription(sessionId);
            } else {
                confirmPayment(sessionId);
            }
        }
    }, [agencyId]);

    const confirmPayment = async (sessionId: string) => {
        if (!agencyId) return;
        try {
            window.history.replaceState({}, '', '/billing');
            setProcessing(true);
            const res = await apiClient.post<any>('/billing/credits/confirm', {
                session_id: sessionId,
                agency_id: agencyId
            });

            if (res.success) {
                toast.success(`Successfully added $${res.credits_added} in credits!`);
                setCredits(res.new_balance);
            }
        } catch (error) {
            console.error('Confirmation error:', error);
            toast.error('Failed to verify payment. Please contact support.');
        } finally {
            setProcessing(false);
        }
    };

    const confirmSubscription = async (sessionId: string) => {
        try {
            window.history.replaceState({}, '', '/billing');
            setProcessing(true);
            const res = await apiClient.post<any>('/billing/subscription/confirm', {
                session_id: sessionId,
                agency_id: agencyId
            });

            if (res.success) {
                toast.success('Subscription activated successfully!');
                if (res.plan_id) {
                    setCurrentPlanId(res.plan_id.toLowerCase());
                }
                await fetchCurrentSubscription();
                
                const balanceRes = await apiClient.get<any>(`${API_ENDPOINTS.BILLING.BALANCE}?agency_id=${agencyId}`);
                const creditValue = typeof balanceRes === 'number' ? balanceRes : parseFloat(balanceRes?.credits) || 0;
                setCredits(creditValue);
            }
        } catch (error: any) {
            console.error('Subscription confirmation error:', error);
            toast.error(`Failed to confirm subscription: ${error.message || 'Please contact support.'}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleAddFunds = async () => {
        let amount = selectedAmount;
        if (isCustom) {
            const parsed = parseFloat(customAmount);
            if (isNaN(parsed) || parsed < 20) {
                toast.error('Minimum purchase amount is $20.');
                return;
            }
            amount = parsed;
        }

        try {
            setProcessing(true);
            const res = await apiClient.post<any>(API_ENDPOINTS.BILLING.PURCHASE, {
                agency_id: agencyId,
                amount
            });

            if (res.url) {
                window.location.href = res.url;
            } else {
                toast.error('Purchase initiated but no payment URL returned.');
                setProcessing(false);
            }
        } catch (error: any) {
            console.error('Purchase error:', error);
            toast.error(`Error processing request: ${error.message}`);
            setProcessing(false);
        }
    };

    const handleSubscribe = async (plan: any) => {
        if ((!plan.price || typeof plan.price !== 'number') && !plan.stripePriceId) {
            toast.warning('Custom enterprise plans require sales contact.');
            return;
        }

        try {
            setProcessing(true);
            const res = await apiClient.post<any>(API_ENDPOINTS.BILLING.SUBSCRIBE, {
                agency_id: agencyId,
                plan_id: plan.id,
                plan_name: plan.name,
                price_cents: typeof plan.price === 'number' ? Math.round(plan.price * 100) : 0,
                stripe_price_id: plan.stripePriceId
            });

            if (res.url) {
                window.location.href = res.url;
            } else {
                toast.error('Failed to initiate subscription checkout.');
                setProcessing(false);
            }
        } catch (error: any) {
            console.error('Subscription error:', error);
            toast.error(`Error: ${error.message}`);
            setProcessing(false);
        }
    };

    const handleManageSubscription = async () => {
        if (!agencyId) return;
        try {
            setProcessing(true);
            const res = await apiClient.post<any>(`/billing/portal?agency_id=${agencyId}`, {});
            if (res.url) {
                window.location.href = res.url;
            } else {
                toast.error('Failed to open subscription management.');
                setProcessing(false);
            }
        } catch (error: any) {
            console.error('Portal error:', error);
            toast.error(`Error: ${error.message}`);
            setProcessing(false);
        }
    };

    const currentPlan = PRICING_TIERS.find(p => p.id === currentPlanId) || PRICING_TIERS[0];
    const defaultViewPlanId = agencyId ? 'enterprise' : 'growth';
    const effectiveViewPlanId = viewPlanId ?? defaultViewPlanId;
    const viewingPlan = PRICING_TIERS.find(p => p.id === effectiveViewPlanId) || PRICING_TIERS.find(p => p.id === 'enterprise') || PRICING_TIERS[2];
    
    const formatRenewalDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const renewalDate = subscriptionDetails?.current_period_end 
        ? formatRenewalDate(subscriptionDetails.current_period_end)
        : null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <h1 className="text-4xl font-bold text-foreground">Billing & Credits</h1>

            {/* How Billing Works Explainer */}
            <Card className="p-0 border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">How Billing Works on Kaivo</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
                    <div className="p-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/20 rounded-lg">
                                <Monitor className="w-5 h-5 text-primary" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">Kaivo-Managed Ads</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Run ads directly through Kaivo&apos;s interface using our managed ad accounts.
                            You pay a <strong className="text-foreground">monthly platform fee</strong> plus
                            <strong className="text-foreground"> ad credits</strong> which fund your campaign budgets.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-md w-fit">
                            <Zap className="w-3.5 h-3.5" />
                            Platform Fee + Ad Credits
                        </div>
                    </div>
                    <div className="p-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg">
                                <BarChart3 className="w-5 h-5 text-purple-400" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">Reporting Only</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Connect your <strong className="text-foreground">own ad platform accounts</strong> and use Kaivo
                            purely for analytics, insights, and reporting.
                            You only pay the <strong className="text-foreground">monthly platform fee</strong> &mdash; no ad credits needed.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-md w-fit">
                            <BarChart3 className="w-3.5 h-3.5" />
                            Platform Fee Only
                        </div>
                    </div>
                </div>
            </Card>

            {/* Billing Mode Summary per Client */}
            {billingSummary && billingSummary.total_clients > 0 && (
                <Card className="p-6 border-border bg-card">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Your Clients&apos; Billing Modes</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {billingSummary.kaivo_managed_count > 0 && (
                            <div className="rounded-lg border border-primary/20 bg-kaivo-teal-neon/5 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Monitor className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-semibold text-primary">
                                        Kaivo-Managed ({billingSummary.kaivo_managed_count})
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {billingSummary.kaivo_managed_clients.map(c => (
                                        <span key={c.id} className="text-xs bg-white/10 text-gray-300 px-2 py-1 rounded">
                                            {c.name}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-3">These clients consume ad credits for campaigns.</p>
                            </div>
                        )}
                        {billingSummary.reporting_only_count > 0 && (
                            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <BarChart3 className="w-4 h-4 text-purple-400" />
                                    <span className="text-sm font-semibold text-purple-400">
                                        Reporting Only ({billingSummary.reporting_only_count})
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {billingSummary.reporting_only_clients.map(c => (
                                        <span key={c.id} className="text-xs bg-white/10 text-gray-300 px-2 py-1 rounded">
                                            {c.name}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-3">These clients only pay the monthly platform fee.</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Section 1: Current Subscription Status */}
            <Card className="p-6 border-primary/30 bg-gradient-to-r from-kaivo-teal-deep/50 to-card">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary/20 rounded-lg">
                            <CreditCard className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-bold text-foreground">{currentPlan.name}</h2>
                                <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs font-bold rounded uppercase">
                                    {subscriptionDetails?.status || 'Active'}
                                </span>
                            </div>
                            <p className="text-muted-foreground text-sm mb-3">{currentPlan.description}</p>
                            <div className="flex flex-wrap gap-4 text-sm">
                                <div className="flex items-center gap-2 text-gray-300">
                                    <TrendingUp className="w-4 h-4 text-primary" />
                                    <span>Spend Limit: <strong className="text-foreground">
                                        {currentPlan.maxSpend ? `$${(currentPlan.maxSpend / 1000).toFixed(0)}k/mo` : 'Unlimited'}
                                    </strong></span>
                                </div>
                                {renewalDate && (
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <Calendar className="w-4 h-4 text-primary" />
                                        <span>Renews: <strong className="text-foreground">{renewalDate}</strong></span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-gray-300">
                                    <span>Platform Fee: <strong className="text-foreground">
                                        {typeof currentPlan.price === 'number' ? `$${currentPlan.price}/mo` : currentPlan.price}
                                    </strong></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {currentPlanId !== 'free' && (
                        <button 
                            onClick={handleManageSubscription}
                            disabled={processing}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:border-primary/40 transition-colors disabled:opacity-50"
                        >
                            <Settings className="w-4 h-4" />
                            {processing ? 'Loading...' : 'Manage Subscription'}
                        </button>
                    )}
                </div>
            </Card>

            {/* Section 2: Ad Spend Balance (Pay as you go) removed for Shopify Review V1 */}

            {/* Section 3: Upgrade Plans — Agencies may only select Enterprise */}
            <div className="space-y-6">
                {agencyId && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        <strong>Agency accounts</strong> must use the Enterprise plan only. Other tiers are not available.
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-foreground">
                        {currentPlanId === 'free' ? 'Upgrade Your Plan' : 'Change Plan'}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {PRICING_TIERS
                            .filter(p => p.id !== currentPlanId && (!agencyId || p.id === 'enterprise'))
                            .map(plan => (
                            <button
                                key={plan.id}
                                onClick={() => setViewPlanId(plan.id)}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
                                    effectiveViewPlanId === plan.id
                                        ? "bg-white text-black border-white"
                                        : "bg-transparent text-muted-foreground border-border hover:border-white/50"
                                )}
                            >
                                {plan.name}
                            </button>
                        ))}
                    </div>
                </div>

                <Card className="p-6 border-border bg-card">
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    {viewingPlan.popular && (
                                        <div className="inline-flex items-center gap-1 bg-primary/20 text-primary px-2 py-0.5 rounded text-xs font-bold mb-2">
                                            <Star className="w-3 h-3 fill-current" /> MOST POPULAR
                                        </div>
                                    )}
                                    <h3 className="text-2xl font-bold text-foreground">{viewingPlan.name}</h3>
                                    <p className="text-muted-foreground mt-1">{viewingPlan.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-bold text-foreground">
                                        {typeof viewingPlan.price === 'number' ? `$${viewingPlan.price}` : viewingPlan.price}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {typeof viewingPlan.price === 'number' ? 'per month' : ''}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">What's Included</h4>
                                    <ul className="space-y-2">
                                        {viewingPlan.features.slice(0, 6).map((f, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                                <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Spend Limits</h4>
                                    <div className="bg-white/5 rounded-lg p-4 border border-border">
                                        <div className="text-2xl font-bold text-foreground mb-1">
                                            {viewingPlan.maxSpend 
                                                ? `$${(viewingPlan.minSpend / 1000).toFixed(0)}k - $${(viewingPlan.maxSpend / 1000).toFixed(0)}k`
                                                : `$${(viewingPlan.minSpend / 1000).toFixed(0)}k+`
                                            }
                                        </div>
                                        <div className="text-sm text-muted-foreground">Monthly ad spend</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:w-64 flex flex-col justify-center">
                            <button
                                onClick={() => handleSubscribe(viewingPlan)}
                                disabled={processing || viewingPlan.id === currentPlanId || Boolean(agencyId && viewingPlan.id !== 'enterprise')}
                                className={cn(
                                    buttonVariants({ size: "lg" }),
                                    "w-full bg-kaivo-teal-neon text-black hover:bg-kaivo-teal-neon/90 disabled:opacity-50"
                                )}
                            >
                                {processing ? 'Processing...' : (
                                    <>
                                        {currentPlanId === 'free' ? 'Upgrade to' : 'Switch to'} {viewingPlan.name}
                                        <ChevronRight className="w-4 h-4 ml-1" />
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 text-center mt-3">
                                Cancel anytime. Billed monthly.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Section 4: Transaction History */}
            <Card className="p-6 border-border">
                <h2 className="text-xl font-bold mb-6 text-foreground">Transaction History</h2>
                {loadingTransactions ? (
                    <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No transactions yet. Add funds to get started.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="border-b border-border">
                            <tr>
                                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Date</th>
                                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Description</th>
                                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Amount</th>
                                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
                                <th className="pb-3 font-medium text-gray-500 text-xs uppercase tracking-wide text-right">Receipt</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {transactions.map((transaction) => {
                                const date = new Date(transaction.created_at);
                                const formattedDate = date.toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short', 
                                    day: 'numeric' 
                                });
                                const amount = parseFloat(transaction.amount.toString());
                                
                                return (
                                    <tr key={transaction.id} className="group hover:bg-white/5">
                                        <td className="py-3 text-muted-foreground text-sm">{formattedDate}</td>
                                        <td className="py-3 font-medium text-foreground text-sm">
                                            {transaction.description}
                                            <div className="md:hidden text-xs text-primary mt-1">
                                                {amount > 0 ? '+' : ''}${Math.abs(amount).toFixed(2)}
                                            </div>
                                        </td>
                                        <td className={cn(
                                            "py-3 text-sm font-semibold hidden md:table-cell",
                                            amount > 0 ? 'text-primary' : 'text-muted-foreground'
                                        )}>
                                            {amount > 0 ? '+' : '-'}${Math.abs(amount).toFixed(2)}
                                        </td>
                                        <td className="py-3">
                                            <span className="text-xs font-medium px-2 py-1 rounded bg-white/5 text-muted-foreground capitalize">
                                                {transaction.transaction_type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right">
                                            {transaction.stripe_payment_id ? (
                                                <button className="text-primary hover:underline text-sm">Download</button>
                                            ) : (
                                                <span className="text-gray-600 text-sm">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
}
