'use client';

export const runtime = 'edge';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { ApiErrorBanner } from '@/components/ui/ApiErrorBanner';
import { useClients, useCampaigns, useClientHierarchy, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { Campaign, HierarchyClientRow, MetaInsights } from '@/lib/api/contracts';
import { ClientMetaSection } from '@/components/agency/ClientMetaSection';
import { ClientRedditSection } from '@/components/agency/ClientRedditSection';

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
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-bold font-mono ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PacingBar({ pacing }: { pacing: number }) {
  const color = pacing >= 90 ? 'bg-green' : pacing >= 80 ? 'bg-teal' : pacing >= 70 ? 'bg-amber' : 'bg-coral';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 max-w-[72px] h-[5px] rounded-full bg-surface-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pacing)}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-text-muted font-mono tabular-nums">{pacing}%</span>
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
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${styles[severity] ?? 'bg-surface-secondary text-text-muted'}`}>
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
  ctr?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

interface DisplayPlatformNode {
  key: string;
  name: string;
  score: number;
  impressions: number;
  clicks: number;
  spend: number;
  budget: number;
  pacing: number;
  cpc: number;
  ctr: number;
  conversions: number;
  status: string;
  aiMode: string;
  campaigns: DisplayCampaign[];
}

function avatarColorFromId(id: number): string {
  const h = (id * 47) % 360;
  return `hsl(${h} 55% 42%)`;
}

function mapMetaCampaignsToDisplay(meta: MetaInsights): DisplayCampaign[] {
  if (!meta.campaigns || meta.campaigns.length === 0) return [];
  return meta.campaigns.map((camp, idx) => {
    const clicks = Number(camp.clicks || 0);
    const impressions = Number(camp.impressions || 0);
    const spend = Number(camp.spend || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const budget = Number(camp.budget || 0);
    const pacing = budget > 0 ? Math.min(200, (spend / budget) * 100) : 0;
    const score = Math.min(100, Math.max(0, 75 + ctr * 10 - cpc / 2));

    return {
      id: idx + 1,
      name: camp.name || `Campaign #${idx + 1}`,
      platform: 'Meta',
      status: (camp.status || 'draft').toLowerCase(),
      budget,
      spend,
      pacing: Math.round(pacing),
      roas: 0,
      cpa: camp.cost_per_conversion ?? 0,
      isReal: true,
    };
  });
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
        <div key={i} className="h-10 bg-surface-secondary rounded-lg" />
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
  const [metaInsights, setMetaInsights] = useState<MetaInsights | null>(null);
  const [metaInsightsLoading, setMetaInsightsLoading] = useState(false);

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

  const hasHierarchyCampaigns = useMemo(
    () => !!hc && hc.platforms.some((p) => p.campaigns.length > 0),
    [hc],
  );

  const campaigns: DisplayCampaign[] = useMemo(() => {
    // 1. Prefer hierarchy (rich performance usage from usage_records)
    if (hasHierarchyCampaigns && hc) {
      return flattenHierarchyCampaigns(hc);
    }
    // 2. Fall back to Meta insights if we have them (direct platform fetch)
    if (metaInsights && metaInsights.campaigns && metaInsights.campaigns.length > 0) {
      return mapMetaCampaignsToDisplay(metaInsights);
    }
    // 3. Finally, fall back to the dedicated campaigns list (static data if no metrics yet)
    if (apiCampaigns.length > 0) return apiCampaigns.map(mapCampaignToDisplay);

    return [];
  }, [apiCampaigns, hc, hasHierarchyCampaigns, metaInsights]);

  const insights = useMemo(
    () => [] as { id: number; client: string; platform: string; severity: string; text: string; impact: string }[],
    [],
  );

  const [viewMode, setViewMode] = useState<'agency' | 'client'>('agency');
  const [dismissedInsightIds, setDismissedInsightIds] = useState<Set<number>>(() => new Set());
  const [pausingId, setPausingId] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const visibleInsights = useMemo(
    () => insights.filter((i) => !dismissedInsightIds.has(i.id)),
    [insights, dismissedInsightIds],
  );

  const platforms = useMemo(() => {
    if (hc?.platforms?.length) {
      return hc.platforms.map((p) => p.display_name);
    }
    const set = new Set<string>();
    campaigns.forEach((c) => set.add(c.platform));
    return Array.from(set);
  }, [hc, campaigns]);

  const loadMetaInsightsFallback = useCallback(async () => {
    if (!accessToken || !agencyId || Number.isNaN(clientId)) return;
    if (metaInsightsLoading) return;
    setMetaInsightsLoading(true);
    try {
      const data = await apiClient.get<MetaInsights>(
        API_ENDPOINTS.META.CLIENT_INSIGHTS(String(clientId)),
        { accessToken, agencyId },
      );
      setMetaInsights(data);
    } catch {
      setMetaInsights(null);
    } finally {
      setMetaInsightsLoading(false);
    }
  }, [accessToken, agencyId, clientId, metaInsightsLoading]);

  useEffect(() => {
    if (hasHierarchyCampaigns) return;
    if (apiCampaigns.length > 0) return;
    if (metaInsightsLoading || metaInsights) return;
    void loadMetaInsightsFallback();
  }, [apiCampaigns.length, hasHierarchyCampaigns, metaInsightsLoading, metaInsights, loadMetaInsightsFallback]);

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

  const platformNodes = useMemo<DisplayPlatformNode[]>(() => {
    // 1. If we have hierarchy with actual campaigns, use it as primary structure.
    const hasHcCampaigns = (hc?.platforms?.some((p) => p.campaigns.length > 0));
    if (hasHcCampaigns) {
      return hc!.platforms.map((p) => {
        const pCampaigns: DisplayCampaign[] = p.campaigns.map((camp) => ({
          id: camp.id,
          name: camp.name,
          platform: p.display_name,
          status: (camp.status || 'active').toLowerCase(),
          budget: camp.metrics.budget,
          spend: camp.metrics.spend,
          pacing: Math.round(camp.metrics.pacing),
          roas: 0,
          cpa: camp.metrics.cost_per_conversion,
          isReal: true,
        }));
        return {
          key: p.key,
          name: p.display_name,
          score: p.metrics.score,
          impressions: p.metrics.impressions,
          clicks: p.metrics.clicks,
          spend: p.metrics.spend,
          budget: p.metrics.budget,
          pacing: Math.round(p.metrics.pacing),
          cpc: p.metrics.cpc,
          ctr: p.metrics.ctr,
          conversions: p.metrics.conversions,
          status: 'live',
          aiMode: 'manual',
          campaigns: pCampaigns,
        };
      });
    }

    // 2. Otherwise, build from the unified campaigns list (includes Meta fallbacks, api list, etc)
    const byPlatform = new Map<string, DisplayCampaign[]>();
    for (const camp of campaigns) {
      const pName = camp.platform || 'Other';
      const arr = byPlatform.get(pName) ?? [];
      arr.push(camp);
      byPlatform.set(pName, arr);
    }
    const nodes = Array.from(byPlatform.entries()).map(([name, rows], idx) => {
      const spend = rows.reduce((s, c) => s + c.spend, 0);
      const budget = rows.reduce((s, c) => s + c.budget, 0);
      const pacing = budget > 0 ? Math.round((spend / budget) * 100) : 0;
      const cpc = rows.reduce((s, c) => s + c.cpa, 0) / Math.max(1, rows.length);
      const ctr = rows.reduce((s, c) => s + (c.ctr || 0), 0) / Math.max(1, rows.length);
      const impressions = rows.reduce((s, c) => s + (c.impressions || 0), 0);
      const clicks = rows.reduce((s, c) => s + (c.clicks || 0), 0);
      const conversions = rows.reduce((s, c) => s + (c.conversions || 0), 0);
      const score = Math.min(100, Math.max(0, 75 + ctr * 10 - cpc / 2));
      return {
        key: `${name.toLowerCase()}-${idx}`,
        name,
        score,
        impressions,
        clicks,
        spend,
        budget,
        pacing,
        cpc,
        ctr,
        conversions,
        status: 'live',
        aiMode: 'manual',
        campaigns: rows,
      };
    });

    if (nodes.length > 0) return nodes;
    return [];
  }, [hc, campaigns]);

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

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAllRows = useCallback(() => {
    const next = new Set<string>();
    for (const p of platformNodes) {
      const pKey = `p-${p.key}`;
      next.add(pKey);
      for (const c of p.campaigns) next.add(`${pKey}-c-${c.id}`);
    }
    setExpandedRows(next);
  }, [platformNodes]);

  const collapseAllRows = useCallback(() => setExpandedRows(new Set()), []);

  if (clientsLoading) {
    return (
      <div className="flex flex-col h-full bg-surface-secondary overflow-hidden">
        <DashboardHeader title="Loading..." />
        <main className="flex-1 overflow-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-surface-secondary rounded-xl border border-border" />
            <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-surface-secondary rounded-xl border border-border" />)}</div>
            <div className="h-64 bg-surface-secondary rounded-xl border border-border" />
          </div>
        </main>
      </div>
    );
  }

  if (!client || Number.isNaN(clientId)) {
    return (
      <div className="flex flex-col h-full bg-surface-secondary overflow-hidden">
        <div className="px-6 pt-4 pb-2 shrink-0">
          <Link href="/clients" className="text-[13px] font-semibold text-teal-deep hover:text-teal-deep/80 transition-colors">
            ← Back to Clients
          </Link>
        </div>
        <DashboardHeader title="Client not found" subtitle="This client is not in your agency or the link is invalid." />
        <main className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-xl border border-border p-8 max-w-lg shadow-sm">
            <p className="text-[15px] text-text-secondary leading-relaxed">
              We could not find a client matching this URL. Return to the clients list to pick an account.
            </p>
            <Link href="/clients" className="inline-flex mt-5 px-4 py-2 rounded-lg bg-teal-deep text-white text-[13px] font-semibold hover:bg-teal-deep/90 transition-colors shadow-sm">
              View all clients
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden font-space">
      <div className="px-6 pt-4 pb-2 shrink-0 border-b-2 border-cream-border bg-white/50 backdrop-blur-md">
        <Link href="/clients" className="text-[13px] font-bold text-v-teal hover:text-v-teal-dark transition-colors">
          ← Back to Clients
        </Link>
      </div>
      <DashboardHeader title={client.name} />

      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Client header card */}
        <section className="bg-white rounded-2xl border-2 border-cream-border p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div
                className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-[15px] font-bold text-white"
                style={{ backgroundColor: client.color }}
                aria-hidden
              >
                {client.initials}
              </div>
              <div className="min-w-0">
                <h1 className="text-[18px] font-bold text-text-primary leading-tight truncate">{client.name}</h1>
                <p className="text-[13px] text-text-muted font-medium mt-0.5">{client.type}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <ScoreBadge score={client.score} />
                  {platforms.map((p) => <PlatformTag key={p} name={p} />)}
                  {platforms.length === 0 && (
                    <span className="text-[11px] font-bold text-v-text-muted">No platforms or campaigns yet</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex rounded-xl border-2 border-cream-border overflow-hidden bg-cream p-0.5" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode('agency')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all ${viewMode === 'agency' ? 'bg-v-teal text-white shadow-md' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                Agency View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('client')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all ${viewMode === 'client' ? 'bg-v-teal text-white shadow-md' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                Client Portal View
              </button>
            </div>
          </div>
        </section>

        {/* ── META ADS SECTION ── */}
        <ClientMetaSection key={`meta-${clientId}`} clientId={clientId} />
        <ClientRedditSection key={`reddit-${clientId}`} clientId={clientId} />

        {/* KPI row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Health Score', value: client.score.toFixed(1) },
            { label: 'Total spend', value: formatUsd(totalSpend) },
            { label: 'Avg ROAS', value: avgRoas > 0 ? avgRoas.toFixed(2) : '—' },
            { label: 'Avg CPA', value: avgCpa > 0 ? formatUsd(avgCpa) : '—' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-2xl border-2 border-cream-border p-6 flex flex-col gap-2 shadow-sm">
              <div className="text-[10px] font-black text-v-text-muted uppercase tracking-[0.15em]">{kpi.label}</div>
              <div className="text-[28px] font-black font-mono text-v-text-primary leading-none tabular-nums">{kpi.value}</div>
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

        {/* Campaigns hierarchy table */}
        <section className="bg-white rounded-2xl border-2 border-cream-border overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b-2 border-cream-border bg-cream/60 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-black text-v-text-primary">Campaigns</h2>
              <p className="text-[11px] text-v-text-muted font-bold mt-0.5">
                {platformNodes.length} platforms · {platformNodes.reduce((s, p) => s + p.campaigns.length, 0)} campaigns
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void refreshHierarchy();
                  void refreshCampaigns();
                }}
                className="px-3 py-1.5 rounded-lg border-2 border-cream-border bg-white text-[11px] font-bold text-v-text-primary hover:border-v-teal transition-colors"
              >
                {metaInsightsLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button type="button" onClick={expandAllRows} className="px-3 py-1.5 rounded-lg border-2 border-cream-border bg-white text-[11px] font-bold text-v-text-primary hover:border-v-teal transition-colors">
                Expand All
              </button>
              <button type="button" onClick={collapseAllRows} className="px-3 py-1.5 rounded-lg border-2 border-cream-border bg-white text-[11px] font-bold text-v-text-primary hover:border-v-teal transition-colors">
                Collapse All
              </button>
            </div>
          </div>
          {(hierarchyLoading && !hc) || (!hc && campaignsLoading) ? (
            <CampaignSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b-2 border-cream-border bg-cream">
                    <th className="w-10 px-2 py-3" />
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Name</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Score</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Impressions</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Clicks</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Spend</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Budget</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Pacing</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">CPC</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">CTR</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Conv.</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">Status</th>
                    <th className="px-4 py-3 font-black text-v-text-muted uppercase text-[9px] tracking-[0.16em]">AI Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {platformNodes.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-5 py-10 text-center text-text-muted font-medium">
                        {metaInsightsLoading ? 'Loading campaigns…' : 'No campaigns found for this client.'}
                      </td>
                    </tr>
                  ) : (
                    platformNodes.map((p) => {
                      const pKey = `p-${p.key}`;
                      const pOpen = expandedRows.has(pKey);
                      return (
                        <Fragment key={pKey}>
                          <tr className="border-b border-cream-border bg-white hover:bg-cream/20 cursor-pointer" onClick={() => toggleRow(pKey)}>
                            <td className="px-2 py-3">
                              <button className="w-6 h-6 rounded-lg border-2 border-cream-border bg-white text-v-text-muted flex items-center justify-center text-[10px]" style={{ transform: pOpen ? 'rotate(90deg)' : undefined }}>▶</button>
                            </td>
                            <td className="px-4 py-3 font-black text-v-text-primary">{p.name}</td>
                            <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-black bg-red-light text-red">{p.score.toFixed(1)}</span></td>
                            <td className="px-4 py-3 font-mono font-bold">{p.impressions.toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono font-bold">{p.clicks.toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono font-black text-coral">{formatUsd(p.spend)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-v-text-muted">{formatUsd(p.budget)}</td>
                            <td className="px-4 py-3"><span className="font-black text-v-teal">{p.pacing}%</span></td>
                            <td className="px-4 py-3 font-mono font-black text-coral">${p.cpc.toFixed(2)}</td>
                            <td className="px-4 py-3 font-mono font-black text-coral">{p.ctr.toFixed(1)}%</td>
                            <td className="px-4 py-3 font-mono font-black">{p.conversions.toLocaleString()}</td>
                            <td className="px-4 py-3"><span className="text-[10px] font-black text-green">• Live</span></td>
                            <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black bg-cream text-v-text-muted">Manual</span></td>
                          </tr>
                          {pOpen &&
                            p.campaigns.map((row) => {
                              const isActive = row.status === 'active' || row.status === 'running';
                              return (
                                <tr key={`${pKey}-${row.id}`} className="border-b border-cream-border/70 bg-cream/30 hover:bg-cream/50 transition-colors">
                                  <td className="px-2 py-2" />
                                  <td className="px-4 py-2 pl-8">
                                    <div className="font-bold text-v-text-primary">{row.name}</div>
                                  </td>
                                  <td className="px-4 py-2"><span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black bg-red-light text-red">—</span></td>
                                  <td className="px-4 py-2 font-mono font-bold">—</td>
                                  <td className="px-4 py-2 font-mono font-bold">—</td>
                                  <td className="px-4 py-2 font-mono font-black text-coral">{formatUsd(row.spend)}</td>
                                  <td className="px-4 py-2 font-mono font-bold text-v-text-muted">{formatUsd(row.budget)}</td>
                                  <td className="px-4 py-2"><span className="font-black text-v-teal">{row.pacing}%</span></td>
                                  <td className="px-4 py-2 font-mono font-black text-coral">{row.cpa > 0 ? `$${row.cpa.toFixed(2)}` : '—'}</td>
                                  <td className="px-4 py-2 font-mono font-black text-coral">—</td>
                                  <td className="px-4 py-2 font-mono font-black">—</td>
                                  <td className="px-4 py-2">
                                    <span className={`text-[10px] font-black ${isActive ? 'text-green' : 'text-amber'}`}>
                                      • {isActive ? 'Live' : 'Pending'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.isReal && viewMode === 'agency' ? (
                                      <button
                                        type="button"
                                        disabled={pausingId === row.id}
                                        onClick={() => handleToggleCampaign(row.id, row.status)}
                                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                          isActive ? 'bg-amber-light text-amber hover:bg-amber/20' : 'bg-green-light text-green hover:bg-green/20'
                                        } disabled:opacity-50`}
                                      >
                                        {pausingId === row.id ? '...' : isActive ? 'Pause' : 'Resume'}
                                      </button>
                                    ) : (
                                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black bg-cream text-v-text-muted">
                                        {viewMode === 'agency' ? 'Manual' : 'Client'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
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
          <section className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50">
              <h2 className="text-[14px] font-bold text-text-primary">AI recommendations</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">Prioritized actions for this client.</p>
            </div>
            <div className="p-5 space-y-4 max-h-[480px] overflow-y-auto">
              {visibleInsights.length === 0 ? (
                <p className="text-[13px] text-text-muted font-medium">No recommendations for this client.</p>
              ) : (
                visibleInsights.map((ins) => (
                  <article key={ins.id} className="rounded-xl border border-border p-4 bg-surface-secondary/40 space-y-3 hover:border-aqua/40 transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={ins.severity} />
                      <PlatformTag name={ins.platform} />
                    </div>
                    <p className="text-[13px] text-text-secondary leading-snug">{ins.text}</p>
                    <p className="text-[12px] font-semibold text-teal-deep">Est. impact: {ins.impact}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="px-3 py-1.5 rounded-lg bg-teal-deep text-white text-[12px] font-semibold hover:bg-teal-deep/90 transition-colors shadow-sm">
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedInsightIds((prev) => new Set(prev).add(ins.id))}
                        className="px-3 py-1.5 rounded-lg border border-border bg-white text-text-secondary text-[12px] font-medium hover:bg-surface-hover transition-colors"
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
          <section className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50">
              <h2 className="text-[14px] font-bold text-text-primary">Recent activity</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">Latest changes and sync events.</p>
            </div>
            <div className="p-5">
              <ul className="space-y-0">
                {activityEntries.map((entry, idx) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-deep shrink-0 ring-4 ring-teal-light" />
                      {idx < activityEntries.length - 1 && (
                        <span className="w-0.5 flex-1 min-h-[28px] bg-border mt-1" aria-hidden />
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
