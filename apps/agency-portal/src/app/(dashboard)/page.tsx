'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDashboard, useClients, useUnassignedCount, useInsights, useInsightsSummary, useApiAuth } from '@/hooks/useAgencyApi';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { MOCK_CLIENTS } from '@/lib/mock/dashboard';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

type TabFilter = 'all' | 'active' | 'inactive';

const AVATAR_COLORS = [
  '#007B5F', '#FF7043', '#5c54c8', '#d4860a', '#2d9e5a',
  '#c85a3d', '#9b5de5', '#0077b5', '#ea4335', '#00b8c4',
];

function getClientColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center px-2 py-[2px] rounded-md text-[11px] font-semibold bg-green-light text-green">Active</span>
    : <span className="inline-flex items-center px-2 py-[2px] rounded-md text-[11px] font-semibold bg-red-light text-red">Inactive</span>;
}

function AccountModeBadge({ mode }: { mode: string }) {
  const isManaged = mode === 'kaivo_managed';
  return (
    <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold ${isManaged ? 'bg-teal-light text-teal-deep' : 'bg-surface-secondary text-text-muted'}`}>
      {isManaged ? 'Managed' : 'Reporting'}
    </span>
  );
}

type Client = {
  id: number;
  name: string;
  is_active: boolean;
  industry?: string | null;
  website?: string | null;
  account_mode?: string | null;
  [key: string]: any;
};

function PlatformTag({ name, className: cls }: { name: string; className?: string }) {
  const colors: Record<string, string> = {
    tiktok: 'bg-[#e6f9fb] text-[#00b8c4]',
    meta: 'bg-[#e8effe] text-[#1877f2]',
    google: 'bg-[#fdecea] text-[#ea4335]',
    youtube: 'bg-[#fdecea] text-[#ff0000]',
  };
  return <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold ${colors[cls || ''] || 'bg-surface-secondary text-text-muted'}`}>{name}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-light text-red',
    warning: 'bg-amber-light text-amber',
    opportunity: 'bg-green-light text-green',
  };
  return <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold capitalize ${styles[severity] || ''}`}>{severity}</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { status } = useRequireAuth();
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboard();
  const { clients: apiClients, isLoading: clientsLoading, error: clientsError } = useClients();
  const { insights, refresh: refreshInsights } = useInsights('pending');
  const { summary, refresh: refreshSummary } = useInsightsSummary();
  const { accessToken, agencyId } = useApiAuth();
  
  const [tab, setTab] = useState<TabFilter>('all');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showUnassignedBar, setShowUnassignedBar] = useState(true);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const { count: unassignedCount } = useUnassignedCount();

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(ev.target as Node)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [profileMenuOpen]);

  const { count: unassignedCount } = useUnassignedCount();
  const [showUnassignedBar, setShowUnassignedBar] = useState(true);

  if (status === 'loading') return <DashboardSkeleton />;
  if (status !== 'authenticated') return null;

  if (dashboardLoading || clientsLoading) {
    return <DashboardSkeleton />;
  }

  const clients: Client[] = apiClients;
  const activeClients = clients.filter((c) => c.is_active);
  const inactiveClients = clients.filter((c) => !c.is_active);

  const filtered = tab === 'all' ? clients
    : tab === 'active' ? activeClients
    : inactiveClients;

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'all', label: 'All Clients' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
  ];

  const agencyName = dashboardData?.agency?.name || 'Agency';
  const clientsCount = dashboardData?.clients_count ?? clients.length;
  const campaignsCount = dashboardData?.campaigns_count ?? 0;
  const activeCampaignsCount = dashboardData?.active_campaigns_count ?? 0;
  const agencyPlan = dashboardData?.agency?.current_plan || 'free';

  return (
    <>
      <DashboardHeader
        title="Portfolio Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <span className="bg-surface-secondary text-text-muted text-[12px] font-medium px-3 py-[6px] rounded-lg border border-border">{agencyName}</span>
            <div ref={profileMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-full border-2 border-cream-border bg-white text-[12px] font-bold text-v-text-primary hover:border-v-teal transition-colors flex items-center justify-center"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Open profile menu"
              >
                <span className="w-7 h-7 rounded-full bg-v-teal text-white text-[10px] font-black flex items-center justify-center">U</span>
              </button>
              {profileMenuOpen && (
                <div role="menu" className="absolute right-0 top-[46px] w-44 rounded-xl border-2 border-cream-border bg-white shadow-lg overflow-hidden z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      router.push('/settings');
                    }}
                    className="w-full text-left px-4 py-2.5 text-[12px] font-semibold text-v-text-primary hover:bg-cream transition-colors"
                    role="menuitem"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void signOut({ callbackUrl: '/login' });
                    }}
                    className="w-full text-left px-4 py-2.5 text-[12px] font-semibold text-red hover:bg-red-light transition-colors border-t border-cream-border"
                    role="menuitem"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="relative max-w-[1400px] mx-auto space-y-6">
          {showUnassignedBar && unassignedCount > 0 && (
            <div className="bg-v-teal text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="8" cy="8" r="7" />
                    <path d="M8 4v4l2.5 1.5" />
                  </svg>
                </span>
                <span className="text-[13px] font-semibold">
                  You have {unassignedCount} unassigned ad account(s)
                </span>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/client-manager"
                  className="bg-white text-v-teal px-4 py-1.5 rounded-lg text-[12px] font-bold hover:bg-white/90 transition-colors"
                >
                  Manage
                </Link>
                <button
                  onClick={() => setShowUnassignedBar(false)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M12 4l-8 8M4 4l8 8" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-24 bg-gradient-animate opacity-25 blur-3xl rounded-[48px] -z-10"
          />

          {/* Error Banner */}
          {(dashboardError || clientsError) && (
            <div className="bg-red-light border border-red/20 rounded-xl p-4 text-[12px] text-red font-medium">
              Failed to load dashboard data. Please check your connection and try again.
            </div>
          )}

          {/* KPI Strip */}
          <div className="relative z-10 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-teal-deep to-teal rounded-xl p-5 text-white relative overflow-hidden shadow-sm transition-all hover:shadow-md">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.20),transparent_55%)] opacity-80"
              />
              <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">Total Clients</div>
              <div className="text-[32px] font-extrabold mt-1 font-mono tracking-tight">
                {clientsCount}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-white/70">
                {activeClients.length} active
              </div>
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/[0.06]" />
              <div className="absolute -right-2 -bottom-6 w-20 h-20 rounded-full bg-white/[0.04]" />
            </div>
            <KpiCard label="Active Campaigns" value={String(activeCampaignsCount)} subtitle={`${campaignsCount} total campaigns`} />
            <KpiCard label="AI Actions Pending" value={String(summary?.total_pending ?? 0)} subtitle={`${summary?.critical_count ?? 0} critical priorities`} />
            <KpiCard label="Clients Affected" value={String(summary?.clients_affected_count ?? 0)} subtitle={clients.length > 0 ? `of ${clients.length} total clients` : 'No clients'} />
          </div>

          {/* Two-column: Table + Info */}
          <div className="grid grid-cols-[1fr_380px] gap-5">
            {/* Client Table */}
            <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="px-5 pt-4 pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-1 bg-surface-secondary border border-border-subtle rounded-xl p-1">
                  {tabs.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex-1 text-center text-[12px] font-semibold px-3 py-[7px] rounded-lg transition-all ${
                        tab === t.key
                          ? 'bg-teal-deep text-white shadow-[0_0_0_3px_rgba(0,123,95,0.18)] ring-1 ring-teal-deep/30'
                          : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wider border-b border-border-subtle">
                    <th className="px-5 py-3">Client</th>
                    <th className="px-3 py-3">Industry</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-[12px] text-text-muted">
                        {clients.length === 0 ? 'No clients yet. Create your first client to get started.' : 'No clients match this filter.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border-subtle/60 hover:bg-surface-hover/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-shadow transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <Link href={`/clients/${c.id}`} className="flex items-center gap-3">
                            <div
                              className="w-[32px] h-[32px] rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                              style={{ background: getClientColor(c.name) }}
                            >
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <div className="text-[12.5px] font-semibold text-text-primary">{c.name}</div>
                              {c.website && <div className="text-[10.5px] text-text-muted truncate max-w-[200px]">{c.website}</div>}
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-text-secondary">{c.industry || '—'}</td>
                        <td className="px-3 py-3"><StatusBadge active={c.is_active} /></td>
                        <td className="px-3 py-3"><AccountModeBadge mode={c.account_mode || 'kaivo_managed'} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="px-5 py-3 text-[11px] text-text-muted font-medium flex items-center justify-between bg-surface-secondary/50">
                <span>{filtered.length} clients shown</span>
                <span className="font-mono">{activeClients.length} active / {inactiveClients.length} inactive</span>
              </div>
            </div>

            <div className="glass-panel rounded-xl border border-border flex flex-col overflow-hidden shadow-sm">
              <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-flex w-2.5 h-2.5 rounded-full bg-v-teal shadow-[0_0_24px_rgba(0,123,95,0.35)]"
                  />
                  <h3 className="text-[13px] font-bold text-v-text-primary">AI Insights</h3>
                </div>
                <span className="bg-coral text-white text-[10px] font-semibold px-2 py-[2px] rounded-md shadow-sm">{insights.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {insights.length === 0 && (
                  <div className="py-10 text-center text-[12px] text-v-text-muted font-medium">
                    All caught up! No pending insights.
                  </div>
                )}
                {insights.slice(0, 8).map((insight) => (
                  <div
                    key={insight.insight_id}
                    className="glass-card bg-white border border-border rounded-xl p-4 space-y-2 transition-all hover:border-v-teal/40 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-v-text-primary">{insight.client_short_name}</span>
                      <PlatformTag name={insight.platform_label} className={insight.platform} />
                      <SeverityBadge severity={insight.severity} />
                    </div>
                    <p className="text-[12px] text-v-text-secondary leading-relaxed font-medium">{insight.title}</p>
                    <div className="bg-v-teal/5 rounded-lg px-3 py-[6px] text-[11px] font-bold text-v-teal">
                      Impact: {insight.impact_metrics[0]?.value || 'Optimization'}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button 
                        onClick={async () => {
                          await apiClient.post(API_ENDPOINTS.INSIGHTS.APPLY(insight.insight_id), { accessToken, agencyId });
                          refreshInsights();
                          refreshSummary();
                        }}
                        className="bg-v-teal text-white text-[10.5px] font-bold px-3 py-[6px] rounded-md hover:bg-v-teal-dark transition-colors shadow-sm"
                      >
                        Apply
                      </button>
                      {insight.review_url ? (
                        <Link 
                          href={insight.review_url}
                          className="bg-cream border border-cream-border text-v-text-primary text-[10.5px] font-bold px-3 py-[6px] rounded-md hover:bg-white transition-colors"
                        >
                          Review
                        </Link>
                      ) : (
                         <Link 
                          href={`/clients/${insight.client_id}`}
                          className="bg-cream border border-cream-border text-v-text-primary text-[10.5px] font-bold px-3 py-[6px] rounded-md hover:bg-white transition-colors"
                        >
                          Review
                        </Link>
                      )}
                      <button 
                        onClick={async () => {
                          await apiClient.post(API_ENDPOINTS.INSIGHTS.DISMISS(insight.insight_id), { accessToken, agencyId });
                          refreshInsights();
                          refreshSummary();
                        }}
                        className="text-text-muted text-[10.5px] font-bold px-2 py-[4px] hover:text-red transition-colors ml-auto"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}

                {/* Client breakdown by industry */}
                {clients.length > 0 && (
                  <div className="glass-card border border-border rounded-xl p-4 space-y-3 mt-4">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Clients by Industry</div>
                    <div className="space-y-2">
                      {Object.entries(
                        clients.reduce<Record<string, number>>((acc, c) => {
                          const ind = c.industry || 'Uncategorized';
                          acc[ind] = (acc[ind] || 0) + 1;
                          return acc;
                        }, {})
                      ).sort(([,a], [,b]) => b - a).map(([industry, count]) => (
                        <div key={industry} className="flex items-center justify-between">
                          <span className="text-[12px] text-text-secondary">{industry}</span>
                          <span className="text-[12px] font-semibold text-text-primary font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {insights.length > 8 && (
                  <Link href="/insights" className="block text-center text-[11px] font-bold text-v-teal py-2 hover:underline">
                    View {insights.length - 8} more insights →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Client List Cards */}
          {clients.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {clients.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="bg-white rounded-xl border border-border p-5 shadow-sm transition-all hover:shadow-md hover:border-aqua/50 hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: getClientColor(c.name) }}
                    >
                      {getInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-text-primary truncate">{c.name}</div>
                      <div className="text-[10.5px] text-text-muted">{c.industry || 'No industry'}</div>
                    </div>
                    <StatusBadge active={c.is_active} />
                  </div>
                  <div className="flex items-center gap-2">
                    <AccountModeBadge mode={c.account_mode || 'kaivo_managed'} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function KpiCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="group relative bg-white rounded-xl p-5 border border-border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-aqua/60">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,123,95,0.22),transparent_55%)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      />
      <div className="relative">
        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</div>
        <div className="text-[28px] font-extrabold text-text-primary mt-1 font-mono tracking-tight">{value}</div>
        <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-text-muted">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <DashboardHeader title="Portfolio Dashboard" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-xl p-5 border border-border animate-pulse shadow-sm">
                <div className="h-3 w-24 bg-surface-secondary rounded mb-3" />
                <div className="h-8 w-16 bg-surface-secondary rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
