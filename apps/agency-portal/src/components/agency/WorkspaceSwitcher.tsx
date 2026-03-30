'use client';

import { useSession } from 'next-auth/react';
import { Building2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/hooks/useAgencyApi';

export function WorkspaceSwitcher() {
  const { data: session } = useSession();
  const { data: dashboard, isLoading } = useDashboard();

  const user = session?.user;
  if (!user?.agencyId) return null;

  const displayName = dashboard?.agency?.name || user.agencyName || 'My Agency';
  const plan = dashboard?.agency?.current_plan || user.tier || 'free';

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-secondary border border-border">
      <div className="h-8 w-8 rounded-lg bg-teal-deep/15 flex items-center justify-center shrink-0 border border-teal-deep/20">
        <Building2 className="h-4 w-4 text-teal-deep" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className={cn(
          "text-sm font-semibold text-text-primary truncate max-w-[150px]",
          isLoading && "animate-pulse"
        )}>
          {displayName}
        </span>
        <span className="text-[10px] text-text-muted capitalize leading-tight">
          {plan} plan
        </span>
      </div>
      <ChevronDown className="h-3.5 w-3.5 text-text-muted/50 shrink-0" />
    </div>
  );
}
