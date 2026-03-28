'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { cn } from '@/lib/utils';
import { User, Palette, Settings, Plug, Zap } from 'lucide-react';

const settingsNavItems = [
    {
        href: '/settings/profile',
        label: 'Profile',
        icon: User,
    },
    {
        href: '/settings/appearance',
        label: 'Appearance',
        icon: Palette,
    },
    {
        href: '/settings/integrations',
        label: 'Integrations',
        icon: Plug
    },
];

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname();

    return (
        <div className="flex bg-background min-h-screen">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 ml-64">
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto p-8">
                        <div className="mb-6">
                            <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
                            <p className="text-muted-foreground">
                                Manage your account settings and preferences.
                            </p>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-6">
                            <aside className="w-full lg:w-64 shrink-0">
                                <nav className="flex flex-row flex-wrap lg:flex-col gap-1">
                                    {settingsNavItems.map((item) => {
                                        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-primary/20 text-primary border border-primary/30"
                                                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                                )}
                                            >
                                                <item.icon className="h-5 w-5" />
                                                <span>{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </aside>

                            <div className="flex-1">
                                {children}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
