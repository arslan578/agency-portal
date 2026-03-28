"use client";

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    LayoutDashboard,
    Megaphone,
    Users,
    Briefcase,
    LogOut,
    Menu,
    X,
    Settings,
    User,
    Palette
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { CardSkeleton } from '@/components/ui/CardSkeleton';
import { NotificationCenter } from '@/components/ui/NotificationCenter';
import { SkipLink } from '@/components/ui/SkipLink';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { CommandPalette } from '@/components/ui/CommandPalette';

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const { isAuthenticated, loading, user, logout } = useAuth();

    const getUserInitials = () => {
        if (user?.email) {
            const emailName = user.email.split('@')[0];
            if (emailName.includes('.')) {
                const parts = emailName.split('.');
                if (parts.length >= 2) {
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                }
                return parts[0].substring(0, 2).toUpperCase();
            }
            return emailName.substring(0, 2).toUpperCase();
        }
        return 'U';
    };

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/auth/signin');
        }
    }, [loading, isAuthenticated, router]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="space-y-4 w-full max-w-md px-4">
                    <CardSkeleton lines={2} />
                    <CardSkeleton lines={3} />
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null; // Will redirect
    }

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
        { href: '/audiences', label: 'Audiences', icon: Users },
        { href: '/agency/dashboard', label: 'Agency', icon: Briefcase },
    ];

    return (
        <div className="min-h-screen flex bg-background">
            <SkipLink />
            {/* Sidebar */}
            <AppSidebar
                onSidebarChange={setSidebarOpen}
            />

            {/* Main Content */}
            <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
                <header className="h-16 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {/* Breadcrumbs Placeholder */}
                        <span className="font-medium text-foreground">Kaivo Workspace</span>
                        <span>/</span>
                        <span className="capitalize">{pathname.split('/')[1] || 'Dashboard'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <NotificationCenter />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button 
                                    className={cn(
                                        buttonVariants({ variant: "ghost", size: "icon" }),
                                        "hover:bg-accent transition-colors duration-200"
                                    )}
                                    aria-label="Settings"
                                >
                                    <Settings className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent 
                                align="end" 
                                className="w-56 bg-card/95 backdrop-blur-lg border border-border shadow-2xl p-2"
                            >
                                <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Settings
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border my-2" />
                                <DropdownMenuItem
                                    onClick={() => router.push('/settings/profile')}
                                    className="px-3 py-2.5 text-sm text-card-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground cursor-pointer transition-colors duration-200 rounded-md"
                                >
                                    <User className="mr-2 h-4 w-4" />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => router.push('/settings/appearance')}
                                    className="px-3 py-2.5 text-sm text-card-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground cursor-pointer transition-colors duration-200 rounded-md"
                                >
                                    <Palette className="mr-2 h-4 w-4" />
                                    <span>Appearance</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button 
                                    className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 border border-primary/30 shadow-lg shadow-primary/10 cursor-pointer hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                                    aria-label="User menu"
                                >
                                    {user?.email ? (
                                        <span className="text-primary font-semibold" aria-hidden="true">{getUserInitials()}</span>
                                    ) : (
                                        <User className="h-5 w-5 text-primary" aria-hidden="true" />
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent 
                                align="end" 
                                className="w-64 bg-card/95 backdrop-blur-lg border border-border shadow-2xl p-2"
                            >
                                {user?.email && (
                                    <>
                                        <DropdownMenuLabel className="px-3 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary text-sm font-bold border border-primary/30 shadow-lg shadow-primary/10">
                                                    <span className="text-primary font-semibold">{getUserInitials()}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-card-foreground truncate leading-tight mb-0.5">
                                                        {user.email.split('@')[0].split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate leading-tight">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-border my-2" />
                                    </>
                                )}
                                <DropdownMenuItem
                                    onClick={logout}
                                    className="px-3 py-2.5 text-sm text-card-foreground hover:bg-red-500/20 hover:text-red-400 focus:bg-red-500/20 focus:text-red-400 cursor-pointer transition-colors duration-200 rounded-md"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Logout</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <main className="flex-1 p-6 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
