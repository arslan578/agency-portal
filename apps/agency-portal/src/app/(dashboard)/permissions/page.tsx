'use client';

import { useState } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Shield, CheckCircle2, XCircle, Users } from 'lucide-react';
import { useMembers } from '@/hooks/useAgencyApi';
import { AGENCY_ROLES, ROLE_PERMISSIONS, type AgencyRole } from '@/lib/api/contracts';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorDisplay } from '@/components/ui/ErrorDisplay';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'matrix' | 'members';

export default function PermissionsPage() {
  const { status } = useRequireAuth();
  const { members, error, isLoading, refresh } = useMembers();
  const [tab, setTab] = useState<TabId>('overview');

  if (status === 'loading') return <PermissionsSkeleton />;
  if (status !== 'authenticated') return null;

  const roles = Object.entries(AGENCY_ROLES) as [AgencyRole, typeof AGENCY_ROLES[AgencyRole]][];

  const allSections = [...new Set(Object.values(ROLE_PERMISSIONS).flatMap(r => r.sections))];

  const membersByRole = roles.map(([key, val]) => ({
    role: key,
    label: val.label,
    members: members.filter(m => m.role === key),
  }));

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Role Overview' },
    { id: 'matrix', label: 'Permission Matrix' },
    { id: 'members', label: 'Members by Role' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Permissions</h1>
        <p className="text-muted-foreground mt-1">View role-based access levels and team permissions</p>
      </div>

      {error && <ErrorDisplay message={error?.message || 'Could not load team data'} onRetry={() => refresh()} />}

      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.id ? "bg-kaivo-teal/15 text-kaivo-teal" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {roles.map(([key, val]) => {
            const perms = ROLE_PERMISSIONS[key];
            const count = members.filter(m => m.role === key).length;
            const colors: Record<string, string> = {
              agency_admin: 'border-kaivo-teal/20',
              agency_manager: 'border-purple-400/20',
              agency_viewer: 'border-blue-400/20',
            };
            const iconColors: Record<string, string> = {
              agency_admin: 'text-kaivo-teal bg-kaivo-teal/10',
              agency_manager: 'text-purple-400 bg-purple-400/10',
              agency_viewer: 'text-blue-400 bg-blue-400/10',
            };
            return (
              <div key={key} className={cn("glass-card rounded-2xl border p-5 space-y-4", colors[key])}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", iconColors[key])}>
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{val.label}</h3>
                      <p className="text-[10px] text-muted-foreground">{val.description}</p>
                    </div>
                  </div>
                  {!isLoading && (
                    <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">{count}</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {perms.capabilities.map(cap => (
                    <div key={cap} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      {cap}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'matrix' && (
        <div className="glass-card rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Section</th>
                  {roles.map(([key, val]) => (
                    <th key={key} className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{val.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSections.map(section => (
                  <tr key={section} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-foreground font-medium">{section}</td>
                    {roles.map(([key]) => {
                      const has = ROLE_PERMISSIONS[key].sections.some(s =>
                        s === section || s.startsWith(section.split(' ')[0])
                      );
                      return (
                        <td key={key} className="text-center px-5 py-3">
                          {has ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400/40 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-6">
          {isLoading ? (
            <PermissionsSkeleton />
          ) : (
            membersByRole.map(group => (
              <div key={group.role}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  {group.label}
                  <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full">{group.members.length}</span>
                </h3>
                {group.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 pl-6">No members with this role</p>
                ) : (
                  <div className="space-y-2">
                    {group.members.map(m => (
                      <div key={m.id} className="glass-card rounded-xl border px-5 py-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {(m.full_name || m.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.full_name || 'Unnamed'}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PermissionsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => (
          <div key={i} className="glass-card rounded-2xl border p-5">
            <Skeleton className="h-9 w-9 rounded-lg mb-3" />
            <Skeleton className="h-5 w-24 mb-2" />
            <Skeleton className="h-3 w-full mb-1" />
            <Skeleton className="h-3 w-3/4 mb-1" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
