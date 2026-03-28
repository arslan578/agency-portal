'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Menu, X, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useCapabilities } from '@/context/CapabilitiesContext';
import { SIDEBAR_CONFIG, NavGroup, NavItem } from '@/config/nav';

interface AppSidebarProps {
    className?: string;
    onSidebarChange?: (isOpen: boolean) => void;
}

export function AppSidebar({ className, onSidebarChange }: AppSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const { capabilities } = useCapabilities();

    const [isOpen, setIsOpen] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        onSidebarChange?.(isOpen);
    }, [isOpen, onSidebarChange]);

    const toggleGroup = (groupId: string) => {
        setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const isItemVisible = (item: NavItem) => {
        if (item.requiresFeature && !capabilities?.features?.[item.requiresFeature]) {
            return false;
        }
        if (item.requiresAgency && !user?.agency_id) {
            return false;
        }
        return true;
    };

    const renderNavGroup = (group: NavGroup) => {
        if (group.requiresAgency && !user?.agency_id) return null;
        const visibleItems = group.items.filter(isItemVisible);
        if (visibleItems.length === 0) return null;

        const isCollapsed = collapsedGroups[group.id];

        return (
            <div key={group.id} className="mb-4">
                {group.label && isOpen && (
                    <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-foreground transition-colors duration-200"
                    >
                        <span>{group.label}</span>
                    </button>
                )}

                {group.label && !isOpen && (
                    <div className="h-px bg-border/50 mx-4 my-2" />
                )}

                <div className={cn("space-y-0.5", isCollapsed && "hidden")}>
                    {visibleItems.map(item => {
                        const Icon = item.icon;
                        const href = item.href;
                        const isActive = pathname === href || pathname.startsWith(`${href}/`);

                        return (
                            <Link
                                key={item.href}
                                href={href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 group text-sm relative",
                                    isActive
                                        ? "bg-primary/10 text-primary border-l-2 border-primary pl-3 font-medium"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground font-normal",
                                    !isOpen && "justify-center px-0"
                                )}
                                title={!isOpen ? item.label : undefined}
                            >
                                <Icon className={cn(
                                    "h-4 w-4 shrink-0 transition-colors duration-200",
                                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                )} />
                                {isOpen && <span className="truncate">{item.label}</span>}
                            </Link>
                        );
                    })}
                </div>
            </div>
        );
    };

    const getUserInitials = () => {
        if (user?.email) {
            const emailName = user.email.split('@')[0];
            // Extract initials from email: "deeptanshu.sankhwar" -> "DS"
            if (emailName.includes('.')) {
                const parts = emailName.split('.');
                if (parts.length >= 2) {
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                }
                return parts[0].substring(0, 2).toUpperCase();
            }
            // Single word email: take first 2 characters
            return emailName.substring(0, 2).toUpperCase();
        }
        return 'U';
    };

    const getUserDisplayName = () => {
        if (user?.email) {
            const emailName = user.email.split('@')[0];
            // Format: "deeptanshu.sankhwar" -> "Deeptanshu Sankhwar"
            if (emailName.includes('.')) {
                return emailName.split('.').map(part => 
                    part.charAt(0).toUpperCase() + part.slice(1)
                ).join(' ');
            }
            // Single word: capitalize first letter
            return emailName.charAt(0).toUpperCase() + emailName.slice(1);
        }
        return 'User';
    };

    return (
        <aside
            className={cn(
                "bg-card border-r border-border/50 transition-all duration-300 flex flex-col fixed h-full z-20",
                isOpen ? "w-64" : "w-16",
                className
            )}
        >
            {/* Logo Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-border/50 shrink-0 bg-card/50 backdrop-blur-sm">
                {isOpen ? (
                    <Link 
                        href="/dashboard" 
                        className="flex items-center gap-3 overflow-hidden hover:opacity-80 transition-opacity duration-200"
                    >
                        <div className="relative w-8 h-8 flex items-center justify-center">
                            <Image
                                src="/images/kaivo_logo.png"
                                alt="Kaivo Logo"
                                width={32}
                                height={32}
                                className="object-contain"
                            />
                        </div>
                        <span className="font-bold text-lg tracking-tight text-primary">KAIVO</span>
                    </Link>
                ) : (
                    <Link 
                        href="/dashboard"
                        className="flex items-center justify-center w-8 h-8 hover:opacity-80 transition-opacity duration-200"
                    >
                        <Image
                            src="/images/kaivo_logo.png"
                            alt="Kaivo Logo"
                            width={24}
                            height={24}
                            className="object-contain"
                        />
                    </Link>
                )}
                <button
                    className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "ml-auto hover:bg-accent transition-colors duration-200"
                    )}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
            </div>

            {/* Navigation Content */}
            <div className="flex-1 overflow-y-auto py-4 px-2 scrollbar-thin scrollbar-thumb-muted">
                {SIDEBAR_CONFIG.map(renderNavGroup)}
            </div>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-border/50 mt-auto shrink-0 bg-gradient-to-t from-card/95 to-card/50 backdrop-blur-sm">
                {isOpen && user && (
                    <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-accent hover:bg-accent/80 border border-border transition-all duration-200 group">
                        <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 border border-primary/30 shadow-lg shadow-primary/10">
                            {user.email ? (
                                <span className="text-primary font-semibold">{getUserInitials()}</span>
                            ) : (
                                <User className="h-5 w-5 text-primary" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate leading-tight mb-0.5">
                                {getUserDisplayName()}
                            </p>
                            {user.email && (
                                <p className="text-xs text-muted-foreground truncate leading-tight">
                                    {user.email}
                                </p>
                            )}
                        </div>
                    </div>
                )}
                {!isOpen && user && (
                    <div className="flex items-center justify-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary text-sm font-bold border border-primary/30 shadow-lg shadow-primary/10">
                            {user.email ? (
                                <span className="text-primary font-semibold">{getUserInitials()}</span>
                            ) : (
                                <User className="h-5 w-5 text-primary" />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
