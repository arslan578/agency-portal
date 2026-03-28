"use client";

import { Bell, Search, User, Menu } from 'lucide-react';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Input } from '@/components/ui/Input';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSelector } from '@/components/ui/LanguageSelector';

export function Header() {
    return (
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex items-center gap-4">
                {/* Breadcrumbs or Page Title could go here */}
            </div>

            <div className="flex items-center gap-4">
                <LanguageSelector />
                <ThemeToggle />

                <button className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
                    <Bell className="h-5 w-5" />
                </button>

                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold cursor-pointer">
                    <User className="h-4 w-4" />
                </div>
            </div>
        </header>
    );
}
