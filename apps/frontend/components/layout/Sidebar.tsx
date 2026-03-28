"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Megaphone, Users, CreditCard, Settings, Building2, FileText, Sparkles, Layers, Cpu, ShieldCheck } from "lucide-react"
import { useTranslation } from "@/context/LanguageContext"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { useAuth } from "@/context/AuthContext"

export function Sidebar() {
    const pathname = usePathname()
    const { t } = useTranslation()
    const { user } = useAuth()
    const isAgencyUser = Boolean(user?.agency_id)

    const routes = [
        {
            label: t("dashboard"),
            icon: LayoutDashboard,
            href: "/dashboard",
            color: "text-sky-500",
        },
        {
            label: "Campaign Builder",
            icon: Layers,
            href: "/plans/new",
            color: "text-indigo-500",
        },
        {
            label: t("campaigns"),
            icon: Megaphone,
            href: "/campaigns",
            color: "text-violet-500",
        },
        {
            label: "Intelligence",
            icon: Cpu,
            href: "/intelligence/overview",
            color: "text-cyan-500",
        },
        {
            label: "Audiences",
            icon: Users,
            href: "/audiences",
            color: "text-pink-700",
        },
        {
            label: "Create Ad Copy",
            icon: Sparkles,
            href: "/creative",
            color: "text-orange-700",
        },
        {
            label: "Agency",
            icon: Building2,
            href: "/agency/dashboard",
            color: "text-emerald-500",
            requiresAgency: true,
        },
        {
            label: "Billing",
            icon: CreditCard,
            href: "/billing",
            color: "text-green-700",
        },
        {
            label: "Admin",
            icon: ShieldCheck,
            href: "/admin",
            color: "text-red-500",
        },
        {
            label: t("settings"),
            icon: Settings,
            href: "/settings",
            color: "text-gray-500",
        },
    ]

    const visibleRoutes = routes.filter((r) => !(r as { requiresAgency?: boolean }).requiresAgency || isAgencyUser);
    const primaryRoutes = visibleRoutes.slice(0, 4);
    const secondaryRoutes = visibleRoutes.slice(4);

    return (
        <div className="w-64 shrink-0 space-y-4 py-4 flex flex-col h-full bg-card text-card-foreground border-r border-border">
            <div className="px-3 py-2 flex-1 overflow-y-auto">
                <Link href="/dashboard" className="flex items-center pl-3 mb-8">
                    <div className="relative w-8 h-8 mr-4">
                        {/* Logo placeholder */}
                        <div className="absolute fill-current text-primary text-3xl font-bold -top-1">K</div>
                    </div>
                    <h1 className="text-2xl font-bold text-card-foreground tracking-wide">
                        Kaivo
                    </h1>
                </Link>

                <div className="space-y-1 mb-6">
                    {primaryRoutes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-foreground hover:bg-accent rounded-lg transition whitespace-nowrap",
                                pathname === route.href || pathname?.startsWith(route.href + '/') ? "text-primary bg-primary/10" : "text-muted-foreground"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>

                <div className="my-4 border-t border-white/5 mx-2" />

                <div className="space-y-1">
                    <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">
                        Management
                    </p>
                    {secondaryRoutes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-foreground hover:bg-accent rounded-lg transition whitespace-nowrap",
                                pathname === route.href || pathname?.startsWith(route.href + '/') ? "text-primary bg-primary/10" : "text-muted-foreground"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="px-3 py-4 border-t border-border">
                <div className="px-3 mb-3 flex gap-4 text-xs text-muted-foreground">
                    <Link href="/terms" className="hover:text-foreground transition">Terms</Link>
                    <Link href="/privacy" className="hover:text-foreground transition">Privacy</Link>
                </div>
                <div className="flex items-center justify-between px-3">
                    <Link href="/auth/signout" className="text-sm text-muted-foreground hover:text-foreground transition">
                        Sign Out
                    </Link>
                    <ThemeToggle />
                </div>
            </div>
        </div>
    )
}
