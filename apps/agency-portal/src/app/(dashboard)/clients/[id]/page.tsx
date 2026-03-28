'use client';

export const runtime = 'edge';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { ApiErrorBanner } from '@/components/ui/ApiErrorBanner';
import { useClients, useCampaigns, useClientHierarchy, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { Campaign, HierarchyClientRow } from '@/lib/api/contracts';

function platformKey(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('youtube')) return 'youtube';
  if (p.includes('google')) return 'google';
  if (p.includes('tiktok')) return 'tiktok';
  if (p.includes('meta') || p.includes('facebook')) return 'meta';
  if (p.includes('linkedin')) return 'linkedin';
  return p;
}

function PlatformTag({ name }: { name: string }) {
  const key = platformKey(name);
  const colors: Record<string, string> = {
    tiktok: 'bg-[#e6f9fb] text-[#00b8c4]',
    meta: 'bg-[#e8effe] text-[#1877f2]',
    google: 'bg-[#fdecea] text-[#ea4335]',
    youtube: 'bg-[#fdecea] text-[#ff0000]',
    linkedin: 'bg-[#e8f0f8] text-[#0077b5]',
  };
  return (
    <span className={`inline-flex px-2 py-[3px] rounded-md text-[10.5px] font-bold ${colors[key] || 'bg-purple-light text-purple'}`}>
      {name}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-light text-green' : score >= 60 ? 'bg-amber-light text-amber' : 'bg-red-light text-red';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-extrabold font-mono ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PacingBar({ pacing }: { pacing: number }) {
  const color = pacing >= 90 ? 'bg-green' : pacing >= 80 ? 'bg-teal' : pacing >= 70 ? 'bg-amber' : 'bg-coral';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 max-w-[72px] h-[6px] rounded-full bg-cream-dark overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pacing)}%` }} />
      </div>
      <span className="text-[11px] font-bold text-text-muted font-mono tabular-nums">{pacing}%</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-light text-red',
    warning: 'bg-amber-light text-amber',
    opportunity: 'bg-teal-light text-teal',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${styles[severity] ?? 'bg-cream text-text-muted'}`}>
      {severity}
    </span>
  );
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface DisplayCampaign {
  id: number;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spend: number;
  pacing: number;
  roas: number;
  cpa: number;
  isReal: boolean;
}

function avatarColorFromId(id: number): string {
  const h = (id * 47) % 360;
  return `hsl(${h} 55% 42%)`;
}

function mapCampaignToDisplay(c: Campaign): DisplayCampaign {
  const budget = (c.total_budget_cents ?? 0) / 100;
  const platforms = c.platform_allocations ? Object.keys(c.platform_allocations) : [];
  const platform = platforms.length > 0 ? platforms[0].charAt(0).toUpperCase() + platforms[0].slice(1) : 'Unknown';
  const st = (c.status || 'draft').toLowerCase();
  return {
    id: c.id,
    name: c.name || `Campaign #${c.id}`,
    platform,
    status: st,
    budget,
    spend: 0,
    pacing: 0,
    roas: 0,
    cpa: 0,
    isReal: true,
  };
}

function flattenHierarchyCampaigns(hc: HierarchyClientRow): DisplayCampaign[] {
  const out: DisplayCampaign[] = [];
  for (const p of hc.platforms) {
    for (const camp of p.campaigns) {
      const st = (camp.status || 'draft').toLowerCase();
      out.push({
        id: camp.id,
        name: camp.name,
        platform: p.display_name,
        status: st,
        budget: camp.metrics.budget,
        spend: camp.metrics.spend,
        pacing: Math.round(camp.metrics.pacing),
        roas: 0,
        cpa: camp.metrics.cost_per_conversion,
        isReal: true,
      });
    }
  }
  return out;
}

function CampaignSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-cream-dark rounded-lg" />
      ))}
    </div>
  );
}

export default function ClientDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const idStr = Array.isArray(rawId) ? rawId[0] : rawId;
  const clientId = idStr != null ? Number(idStr) : NaN;

  const { clients, isLoading: clientsLoading } = useClients();
  const { campaigns: apiCampaigns, error: campaignError, isLoading: campaignsLoading, refresh: refreshCampaigns } = useCampaigns(Number.isNaN(clientId) ? undefined : clientId);
  const { hierarchy, error: hierarchyError, isLoading: hierarchyLoading, refresh: refreshHierarchy } = useClientHierarchy('7d', Number.isNaN(clientId) ? undefined : clientId);
  const { accessToken, agencyId } = useApiAuth();

  const hc = hierarchy?.clients?.[0];

  const fromList = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  const client = useMemo(() => {
    if (!fromList) return undefined;
    const metrics = hc?.metrics;
    const parts = fromList.name.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : fromList.name.slice(0, 2).toUpperCase();
    return {
      id: fromList.id,
      name: fromList.name,
      type: fromList.industry || 'Client',
      initials,
      color: avatarColorFromId(fromList.id),
      score: metrics?.score ?? 0,
      spend: metrics?.spend ?? 0,
      pacing: Math.round(metrics?.pacing ?? 0),
      alerts: metrics?.alerts ?? { count: 0, severity: 'ok' },
    };
  }, [fromList, hc]);

  const campaigns: DisplayCampaign[] = useMemo(() => {
    if (hc) return flattenHierarchyCampaigns(hc);
    if (apiCampaigns.length > 0) return apiCampaigns.map(mapCampaignToDisplay);
    return [];
  }, [hc, apiCampaigns]);

  const insights = useMemo(
    () => [] as { id: number; client: string; platform: string; severity: string; text: string; impact: string }[],
    [],
  );

  const [viewMode, setViewMode] = useState<'agency' | 'client'>('agency');
  const [dismissedInsightIds, setDismissedInsightIds] = useState<Set<number>>(() => new Set());
  const [pausingId, setPausingId] = useState<number | null>(null);

  const visibleInsights = useMemo(
    () => insights.filter((i) => !dismissedInsightIds.has(i.id)),
    [insights, dismissedInsightIds],
  );

  const platforms = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => set.add(c.platform));
    return Array.from(set);
  }, [campaigns]);

  const avgRoas = useMemo(() => {
    if (campaigns.length === 0) return 0;
    return campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length;
  }, [campaigns]);

  const avgCpa = useMemo(() => {
    if (campaigns.length === 0) return 0;
    return campaigns.reduce((s, c) => s + c.cpa, 0) / campaigns.length;
  }, [campaigns]);

  const totalSpend = useMemo(() => {
    if (campaigns.length > 0) return campaigns.reduce((s, c) => s + c.spend, 0);
    return client?.spend ?? 0;
  }, [campaigns, client]);

  const activityEntries = useMemo(() => {
    if (!client) return [];
    const when = ['2 hours ago', 'Yesterday', '3 days ago', 'Last week'];
    return [
      `Budget pacing reviewed for ${client.name} — ${client.pacing}% of monthly target.`,
      `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} synced across ${platforms.length || 1} platform${platforms.length === 1 ? '' : 's'}.`,
      `Health score updated to ${client.score.toFixed(1)} based on latest performance signals.`,
      client.alerts.count > 0
        ? `${client.alerts.count} alert${client.alerts.count === 1 ? '' : 's'} flagged for agency review.`
        : 'No open alerts — portfolio within expected ranges.',
    ].map((text, i) => ({ id: i + 1, text, when: when[i] ?? 'Earlier' }));
  }, [client, campaigns.length, platforms.length]);

  const handleToggleCampaign = useCallback(async (campaignId: number, currentStatus: string) => {
    if (!accessToken) return;
    setPausingId(campaignId);
    try {
      const url = currentStatus === 'active' || currentStatus === 'running'
        ? API_ENDPOINTS.CAMPAIGN.PAUSE(campaignId)
        : API_ENDPOINTS.CAMPAIGN.START(campaignId);
      await apiClient.post(url, {}, { accessToken, agencyId });
      toast.success(currentStatus === 'active' || currentStatus === 'running' ? 'Campaign paused' : 'Campaign resumed');
      await refreshCampaigns();
      await refreshHierarchy();
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : 'Failed to update campaign';
      toast.error(msg);
    } finally {
      setPausingId(null);
    }
  }, [accessToken, agencyId, refreshCampaigns, refreshHierarchy]);

  if (clientsLoading) {
    return (
      <div className="flex flex-col h-full bg-cream overflow-hidden">
        <DashboardHeader title="Loading..." />
        <main className="flex-1 overflow-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-cream-dark rounded-xl" />
            <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-cream-dark rounded-xl" />)}</div>
            <div className="h-64 bg-cream-dark rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!client || Number.isNaN(clientId)) {
    return (
      <div className="flex flex-col h-full bg-cream overflow-hidden">
        <div className="px-6 pt-4 pb-2 shrink-0">
          <Link href="/clients" className="text-[13px] font-bold text-teal hover:text-teal-dark transition-colors">
            ← Back to Clients
          </Link>
        </div>
        <DashboardHeader title="Client not found" subtitle="This client is not in your agency or the link is invalid." />
        <main className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-xl border-2 border-cream-border p-8 max-w-lg">
            <p className="text-[15px] text-text-secondary leading-relaxed">
              We could not find a client matching this URL. Return to the clients list to pick an account.
            </p>
            <Link href="/clients" className="inline-flex mt-5 px-4 py-2 rounded-lg bg-teal text-white text-[13px] font-bold hover:opacity-95">
              View all clients
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      <div className="px-6 pt-4 pb-2 shrink-0 border-b-2 border-cream-border bg-white">
        <Link href="/clients" className="text-[13px] font-bold text-teal hover:text-teal-dark transition-colors">
          ← Back to Clients
        </Link>
      </div>
      <DashboardHeader title={client.name} />

      <main className="flex-1 overflow-auto p-6 space-y-5">
        {/* Client header card */}
        <section className="bg-white rounded-xl border-2 border-cream-border p-5">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div
                className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-[15px] font-extrabold text-white"
                style={{ backgroundColor: client.color }}
                aria-hidden
              >
                {client.initials}
              </div>
              <div className="min-w-0">
                <h1 className="text-[18px] font-extrabold text-text-primary leading-tight truncate">{client.name}</h1>
                <p className="text-[13px] text-text-muted font-medium mt-0.5">{client.type}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <ScoreBadge score={client.score} />
                  {platforms.map((p) => <PlatformTag key={p} name={p} />)}
                  {platforms.length === 0 && (
                    <span className="text-[11px] font-bold text-text-muted">No connected campaigns</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex rounded-lg border-2 border-cream-border overflow-hidden bg-cream-dark/40 p-0.5" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode('agency')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-md transition-colors ${viewMode === 'agency' ? 'bg-teal text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Agency View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('client')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-md transition-colors ${viewMode === 'client' ? 'bg-teal text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Client Portal View
              </button>
            </div>
          </div>
        </section>

        {/* KPI row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Score', value: client.score.toFixed(1) },
            { label: 'Total spend', value: formatUsd(totalSpend) },
            { label: 'Avg ROAS', value: avgRoas > 0 ? avgRoas.toFixed(2) : '—' },
            { label: 'Avg CPA', value: avgCpa > 0 ? formatUsd(avgCpa) : '—' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl border-2 border-cream-border p-5 flex flex-col gap-2">
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">{kpi.label}</div>
              <div className="text-[28px] font-extrabold font-mono text-text-primary leading-none tabular-nums">{kpi.value}</div>
            </div>
          ))}
        </section>

        {/* Campaign error */}
        {(hierarchyError || campaignError) && (
          <ApiErrorBanner
            error={hierarchyError || campaignError}
            onRetry={() => {
              void refreshHierarchy();
              void refreshCampaigns();
            }}
            title="Failed to load client data"
          />
        )}

        {/* Campaigns table */}
        <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
          <div className="px-5 py-4 border-b-2 border-cream-border bg-cream-dark/30 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-extrabold text-text-primary">Campaigns</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">
                {hc ? 'Metrics from usage (hierarchy API)' : apiCampaigns.length > 0 ? 'Campaign list from API' : 'No campaign data yet'}
                {' · '}
                {viewMode === 'agency' ? 'Agency' : 'Client'} view
              </p>
            </div>
            {(hc || apiCampaigns.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  void refreshHierarchy();
                  void refreshCampaigns();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border-2 border-cream-border bg-white text-text-primary hover:border-teal hover:text-teal transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" /><path d="M13.5 2.5v4h-4" />
                </svg>
                Refresh
              </button>
            )}
          </div>
          {(hierarchyLoading && !hc) || (!hc && campaignsLoading) ? (
            <CampaignSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b-2 border-cream-border bg-cream/80">
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Campaign</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Platform</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Status</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide font-mono">Budget</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide font-mono">Spend</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Pacing</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide font-mono">ROAS</th>
                    <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide font-mono">CPA</th>
                    {viewMode === 'agency' && (
                      <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === 'agency' ? 9 : 8} className="px-5 py-10 text-center text-text-muted font-medium">
                        No campaigns found for this client.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((row) => {
                      const isActive = row.status === 'active' || row.status === 'running';
                      return (
                        <tr key={row.id} className="border-b border-cream-border last:border-b-0 hover:bg-cream-dark/20">
                          <td className="px-5 py-3 font-bold text-text-primary">{row.name}</td>
                          <td className="px-5 py-3"><PlatformTag name={row.platform} /></td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold capitalize ${
                              isActive ? 'bg-green-light text-green' : row.status === 'paused' ? 'bg-amber-light text-amber' : 'bg-cream text-text-muted'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-mono text-text-primary tabular-nums">{formatUsd(row.budget)}</td>
                          <td className="px-5 py-3 font-mono text-text-primary tabular-nums">{formatUsd(row.spend)}</td>
                          <td className="px-5 py-3"><PacingBar pacing={row.pacing} /></td>
                          <td className="px-5 py-3 font-mono text-text-primary tabular-nums">{row.roas.toFixed(2)}</td>
                          <td className="px-5 py-3 font-mono text-text-primary tabular-nums">{formatUsd(row.cpa)}</td>
                          {viewMode === 'agency' && (
                            <td className="px-5 py-3">
                              {row.isReal && (
                                <button
                                  type="button"
                                  disabled={pausingId === row.id}
                                  onClick={() => handleToggleCampaign(row.id, row.status)}
                                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                    isActive
                                      ? 'bg-amber-light text-amber hover:bg-amber/20'
                                      : 'bg-green-light text-green hover:bg-green/20'
                                  } disabled:opacity-50`}
                                >
                                  {pausingId === row.id ? '...' : isActive ? 'Pause' : 'Resume'}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* AI recommendations */}
          <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-cream-border bg-cream-dark/30">
              <h2 className="text-[14px] font-extrabold text-text-primary">AI recommendations</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">Prioritized actions for this client.</p>
            </div>
            <div className="p-5 space-y-4 max-h-[480px] overflow-y-auto">
              {visibleInsights.length === 0 ? (
                <p className="text-[13px] text-text-muted font-medium">No recommendations for this client.</p>
              ) : (
                visibleInsights.map((ins) => (
                  <article key={ins.id} className="rounded-xl border-2 border-cream-border p-4 bg-cream/40 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={ins.severity} />
                      <PlatformTag name={ins.platform} />
                    </div>
                    <p className="text-[13px] text-text-secondary leading-snug">{ins.text}</p>
                    <p className="text-[12px] font-bold text-teal">Est. impact: {ins.impact}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="px-3 py-1.5 rounded-lg bg-teal text-white text-[12px] font-bold hover:opacity-95">
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedInsightIds((prev) => new Set(prev).add(ins.id))}
                        className="px-3 py-1.5 rounded-lg border-2 border-cream-border bg-white text-text-secondary text-[12px] font-bold hover:bg-cream-dark/40"
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Activity timeline */}
          <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-cream-border bg-cream-dark/30">
              <h2 className="text-[14px] font-extrabold text-text-primary">Recent activity</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">Latest changes and sync events.</p>
            </div>
            <div className="p-5">
              <ul className="space-y-0">
                {activityEntries.map((entry, idx) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal shrink-0 ring-4 ring-teal-light" />
                      {idx < activityEntries.length - 1 && (
                        <span className="w-0.5 flex-1 min-h-[28px] bg-cream-border mt-1" aria-hidden />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className="text-[13px] text-text-primary font-medium leading-snug">{entry.text}</p>
                      <p className="text-[11px] text-text-muted font-bold mt-1">{entry.when}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
