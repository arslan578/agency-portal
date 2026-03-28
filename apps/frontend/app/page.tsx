import Link from 'next/link';
import { buttonVariants } from '@/components/ui/Button';
import { ArrowRight, Zap, Shield, Globe, BarChart, CreditCard } from 'lucide-react';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/utils';

export const runtime = 'edge';

export default function LandingPage({
    searchParams,
}: {
    searchParams?: { [key: string]: string | string[] | undefined };
}) {
    // If 'shop' parameter is present, this is a Shopify load request.
    // Redirect to the embedded app entry point.
    if (searchParams?.shop) {
        // Pass all params along to the embedded app
        const queryString = new URLSearchParams(searchParams as Record<string, string>).toString();
        redirect(`/integrations/shopify?${queryString}`);
    }

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-animate -z-10" />
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 -z-10" />

            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 glass-panel border-b border-border px-8 py-4 flex justify-between items-center backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-kaivo-teal-neon to-kaivo-teal-deep rounded-xl shadow-[0_0_15px_rgba(0,255,178,0.3)] flex items-center justify-center">
                        <span className="text-xl font-bold text-white">K</span>
                    </div>
                    <span className="text-2xl font-bold text-foreground tracking-wide">KAIVO</span>
                </div>
                <div className="flex gap-4 items-center">
                    <Link href="/auth/signin" className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground hover:text-foreground")}>
                        Sign In
                    </Link>
                    <Link href="/auth/signin" className={cn(buttonVariants({ variant: "glow" }), "shadow-[0_0_20px_rgba(0,255,178,0.3)]")}>
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-32 pb-20 relative z-10">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-premium border border-primary/30 text-primary text-sm font-medium mb-8 animate-float glow-teal">
                    <Zap className="w-4 h-4" />
                    <span>The Intelligence Layer for Modern Advertising</span>
                </div>

                <h1 className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground mb-8 max-w-5xl leading-tight tracking-tight">
                    Orchestrate Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-kaivo-teal-deep to-kaivo-teal-medium">Media Empire</span>
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mb-12 leading-relaxed font-light">
                    Plan, launch, and optimize campaigns across Streaming TV, Social, and Audio with the world&apos;s first agentic advertising platform.
                </p>

                <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
                    <Link href="/auth/signin" className={cn(buttonVariants({ size: "lg", variant: "primary" }), "w-full sm:w-auto text-lg px-10 py-6 h-auto gradient-primary glow-teal hover:scale-105 transition-transform inline-flex items-center justify-center")}>
                        Start Free Trial
                        <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                    <Link href="/pricing" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto text-lg px-10 py-6 h-auto border-border hover:bg-accent backdrop-blur-sm group inline-flex items-center justify-center")}>
                        <CreditCard className="mr-2 w-5 h-5 group-hover:text-primary transition-colors" />
                        View Pricing
                    </Link>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 max-w-7xl w-full text-left px-4">
                    <div className="glass-premium p-8 card-shadow-lg group">
                        <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 glow-teal">
                            <Globe className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-gradient-teal mb-4 group-hover:scale-105 transition-transform">Precision Planning</h3>
                        <p className="text-muted-foreground leading-relaxed">Simulate reach and budget impact across 50+ platforms before you spend a dollar using our advanced predictive models.</p>
                    </div>
                    <div className="glass-premium p-8 card-shadow-lg group">
                        <div className="w-16 h-16 bg-gradient-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 glow-amber">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-gradient-accent mb-4 group-hover:scale-105 transition-transform">Agentic Launch</h3>
                        <p className="text-muted-foreground leading-relaxed">Let Kaivo&apos;s autonomous agents handle creative validation, policy checks, and deployment across all channels instantly.</p>
                    </div>
                    <div className="glass-premium p-8 card-shadow-lg group">
                        <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 glow-teal">
                            <BarChart className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-gradient-teal mb-4 group-hover:scale-105 transition-transform">Auto-Optimization</h3>
                        <p className="text-muted-foreground leading-relaxed">Our Budget Optimizer shifts spend to high-performing channels automatically in real-time, maximizing your ROAS.</p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-border py-12 text-center text-muted-foreground text-sm relative z-10 bg-card/60 backdrop-blur-lg">
                <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p>© 2025 UMedia2, Inc. All rights reserved.</p>
                    <div className="flex gap-8">
                        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
                        <Link href="mailto:support@getkaivo.com" className="hover:text-primary transition-colors">Contact Support</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
