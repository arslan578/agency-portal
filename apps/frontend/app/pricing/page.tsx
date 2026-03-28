import Link from 'next/link';
import { buttonVariants } from '@/components/ui/Button';
import { CheckCircle, ArrowLeft, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

async function getPlans() {
    // Static Pricing 2.0 Model (No flaking API calls during build)
    return [
        {
            id: 0,
            name: "Free Forever",
            price_monthly: 0,
            min_spend: 0,
            max_spend: 1000,
            cta: "Get Started",
            is_popular: false,
            purpose: "Growth engine + CAC reduction. Creates your 'Shopify Starter / Mailchimp Free' effect.",
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
            id: 1,
            name: "Starter",
            price_monthly: 99,
            min_spend: 1000,
            max_spend: 5000,
            cta: "Start Trial",
            is_popular: false,
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
            id: 2,
            name: "Growth",
            price_monthly: 199,
            min_spend: 5000,
            max_spend: 15000,
            cta: "Start Trial",
            is_popular: true,
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
            id: 3,
            name: "Scale",
            price_monthly: 399,
            min_spend: 15000,
            max_spend: 50000,
            cta: "Start Trial",
            is_popular: false,
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
            id: 4,
            name: "Enterprise",
            price_monthly: "5% of spend",
            min_spend: 50000,
            max_spend: null,
            cta: "Contact Sales",
            is_popular: false,
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
}


export default async function PricingPage() {
    const plans = await getPlans();

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-animate -z-10" />
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 -z-10" />

            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/10 px-8 py-4 flex justify-between items-center backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back to Home</span>
                    </Link>
                </div>
                <div className="flex gap-4 items-center">
                    <Link href="/auth/signin" className={cn(buttonVariants({ variant: "ghost" }), "text-gray-300 hover:text-white")}>
                        Sign In
                    </Link>
                    <Link href="/auth/signin" className={cn(buttonVariants({ variant: "glow" }), "shadow-[0_0_20px_rgba(0,255,178,0.3)]")}>
                        Get Started
                    </Link>
                </div>
            </nav>

            <main className="flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-20 relative z-10">
                <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground mb-6 text-center">
                    Simple, Transparent <span className="text-kaivo-teal-neon">Pricing</span>
                </h1>
                <p className="text-xl text-gray-400 max-w-2xl text-center mb-6">
                    Choose the plan that fits your agency&apos;s scale. No hidden fees.
                </p>

                {/* Shopify App Clarification Block (Ticket 8) */}
                <div className="max-w-3xl w-full mx-auto mb-8 px-4">
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 text-center shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                        <h3 className="text-lg font-bold text-blue-400 mb-2">Notice for Shopify App Users</h3>
                        <p className="text-sm text-gray-300">
                            The Kaivo Shopify App operates independently on a <strong>Free Tier 0</strong> plan. The agency pricing tiers listed below <strong>do not apply</strong> to the Shopify application. Shopify merchants can promote products and create campaigns at no platform cost.
                        </p>
                    </div>
                </div>

                <div className="max-w-3xl w-full mx-auto mb-12 grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
                    <div className="rounded-xl border border-kaivo-teal-neon/20 bg-kaivo-teal-neon/5 p-4 text-center">
                        <p className="text-sm font-semibold text-kaivo-teal-neon mb-1">Running Ads via Kaivo</p>
                        <p className="text-xs text-gray-400">Monthly Platform Fee + Ad Credits</p>
                    </div>
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-center">
                        <p className="text-sm font-semibold text-purple-400 mb-1">Using Your Own Accounts</p>
                        <p className="text-xs text-gray-400">Monthly Platform Fee Only &mdash; No Credits Needed</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 max-w-[90rem] w-full px-4 items-start">
                    {plans.map((plan: any) => (
                        <Card
                            key={plan.id}
                            className={`p-6 flex flex-col transition-all duration-300 h-full relative group ${plan.is_popular
                                ? 'border-kaivo-teal-neon/50 shadow-[0_0_20px_rgba(0,255,178,0.1)] transform md:-translate-y-2 z-10 bg-gradient-to-b from-kaivo-dark-card to-kaivo-dark-bg'
                                : 'hover:border-white/20'
                                }`}
                        >
                            {plan.is_popular && (
                                <div className="absolute top-0 right-0 bg-kaivo-teal-neon text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">POPULAR</div>
                            )}

                            <div className="mb-4">
                                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                                {/* Purpose/Tagline could be added to API response */}
                            </div>

                            <div className={`mb-4 p-3 rounded-lg border ${plan.is_popular ? 'bg-kaivo-teal-neon/10 border-kaivo-teal-neon/20' : 'bg-white/5 border-white/10'}`}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-400 text-xs">Spend</span>
                                    <span className="text-white text-sm font-bold">
                                        {plan.max_spend ? `$${plan.min_spend / 1000}k - $${plan.max_spend / 1000}k` : `$${plan.min_spend / 1000}k+`}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-xs">Fee</span>
                                    <span className={`text-sm font-bold ${plan.price_monthly === 0 ? 'text-kaivo-teal-neon' : 'text-white'}`}>
                                        {typeof plan.price_monthly === 'number' ? `$${plan.price_monthly}/mo` : plan.price_monthly}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-6 space-y-1">
                                {plan.id === 0 ? (
                                    <p className="text-xs text-gray-400 italic">*Must use Kaivo-managed accounts. Ad credits required.</p>
                                ) : (
                                    <>
                                        <p className="text-xs text-kaivo-teal-neon">
                                            Kaivo-managed: Platform fee + ad credits
                                        </p>
                                        <p className="text-xs text-purple-400">
                                            Own accounts: Platform fee only
                                        </p>
                                    </>
                                )}
                            </div>

                            <ul className="space-y-2.5 mb-8 flex-1">
                                {plan.features.map((feature: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-gray-300 text-xs">
                                        <CheckCircle className="w-3.5 h-3.5 text-kaivo-teal-neon shrink-0 mt-0.5" /> {feature}
                                    </li>
                                ))}
                                {plan.excluded && plan.excluded.map((feature: string, i: number) => (
                                    <li key={`ex-${i}`} className="flex items-start gap-2 text-gray-500 text-xs">
                                        <X className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.cta === "Contact Sales" ? "mailto:sales@kaivo.com" : "/auth/signin"}
                                className={cn(
                                    buttonVariants({ variant: plan.is_popular ? "primary" : "outline", size: "sm" }),
                                    "w-full mt-auto inline-flex items-center justify-center",
                                    plan.id === 0 ? 'border-kaivo-teal-neon/30 hover:bg-kaivo-teal-neon/10 hover:text-kaivo-teal-neon' : ''
                                )}
                            >
                                {plan.cta}
                            </Link>
                        </Card>
                    ))}
                </div>
            </main>
        </div>
    );
}
