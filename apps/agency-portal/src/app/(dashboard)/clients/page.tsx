'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useClientHierarchy, useClients, useApiAuth, useCampaigns } from '@/hooks/useAgencyApi';
import { apiClient, type ApiError } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { buildFallbackHierarchy } from '@/lib/api/hierarchyFallback';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { toast } from 'sonner';
import type { Campaign, HierarchyClientRow, HierarchyCampaignRow, HierarchyPlatformRow, MetaInsights } from '@/lib/api/contracts';

type TabFilter = 'all' | 'needs_action' | 'top' | 'manual_ai';
type SortKey = 'score' | 'spend' | 'alerts' | 'ctr';
type Period = 'today' | '7d' | 'mtd' | '30d';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function pacingLabel(pacing: number): string {
  if (pacing >= 90) return 'strong';
  if (pacing >= 83) return 'on track';
  return 'slow';
}

function avatarColorFromId(id: number): string {
  const h = (id * 47) % 360;
  return `hsl(${h} 55% 42%)`;
}

function aiModeFromAccountMode(mode?: string | null): string {
  if (mode === 'reporting_only') return 'manual';
  if (mode === 'kaivo_managed') return 'auto';
  return 'hybrid';
}

function platformSubtitle(c: HierarchyClientRow): string {
  const industry = (c.industry ?? '').trim() || 'Business';
  const n = c.platform_count ?? c.platforms.length;
  return `${industry} · ${n} platform${n !== 1 ? 's' : ''}`;
}

type PlatformWithCampaignAccountId = HierarchyPlatformRow & { _campaignAccountId?: Record<number, string> };

function getPlatformAccountNodes(platform: HierarchyPlatformRow): Array<{ key: string; label: string; sub?: string; matchId?: string }> {
  if ((platform.linked_accounts?.length ?? 0) > 0) {
    return platform.linked_accounts.map((acc) => ({
      key: `linked-${acc.id}`,
      label: acc.external_id || `Account #${acc.id}`,
      sub: 'Linked account',
      matchId: acc.external_id,
    }));
  }
  if (platform.account_ids.length > 0) {
    return platform.account_ids.map((aid, idx) => ({
      key: `aid-${idx}-${aid}`,
      label: aid,
      sub: 'Account ID',
      matchId: aid,
    }));
  }
  return [{ key: 'platform-default', label: 'Platform campaigns', sub: 'No account mapping' }];
}

function campaignToHierarchyFallback(c: Campaign, platformKey: string): HierarchyCampaignRow {
  const budget = (c.total_budget_cents ?? 0) / 100;
  return {
    id: c.id,
    name: c.name || `Campaign #${c.id}`,
    status: c.status || 'draft',
    metrics: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      conversions: 0,
      cost_per_conversion: 0,
      budget,
      pacing: 0,
      score: 0,
      alerts: { count: 0, severity: 'ok' },
    },
    ad_sets: [],
  };
}

function createSyntheticPlatform(
  platformKey: string,
  campaigns: HierarchyCampaignRow[],
): HierarchyPlatformRow {
  const totalBudget = campaigns.reduce((sum, c) => sum + (c.metrics?.budget ?? 0), 0);
  return {
    key: platformKey,
    display_name: platformKey.charAt(0).toUpperCase() + platformKey.slice(1),
    account_ids: [],
    linked_accounts: [],
    metrics: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      conversions: 0,
      cost_per_conversion: 0,
      budget: totalBudget,
      pacing: 0,
      score: 0,
      alerts: { count: 0, severity: 'ok' },
    },
    campaigns,
  };
}

function createMetaFallbackPlatforms(insights: MetaInsights): PlatformWithCampaignAccountId[] {
  if (!insights.campaigns?.length) return [];

  const adSetsByCampaign = new Map<string, typeof insights.ad_sets>();
  for (const ad of insights.ad_sets ?? []) {
    const k = String(ad.campaign_id);
    const arr = adSetsByCampaign.get(k) ?? [];
    arr.push(ad);
    adSetsByCampaign.set(k, arr);
  }

  const campaignAccountId: Record<number, string> = {};

  const campaigns: HierarchyCampaignRow[] = insights.campaigns.map((camp, idx) => {
    const clicks = Number(camp.clicks || 0);
    const impressions = Number(camp.impressions || 0);
    const spend = Number(camp.spend || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const budget = Number(camp.budget || 0);
    const pacing = budget > 0 ? Math.min(200, (spend / budget) * 100) : 0;

    const rawId = String(camp.campaign_id || '');
    const parsed = Number(rawId.replace(/[^\d]/g, ''));
    const id = Number.isFinite(parsed) && parsed > 0 ? parsed : idx + 1;
    campaignAccountId[id] = String(camp.ad_account_id ?? '');

    const adSets = adSetsByCampaign.get(rawId) ?? [];

    const score = Math.min(100, Math.max(0, 75 + ctr * 10 - cpc / 2));

    return {
      id,
      name: camp.name || `Campaign #${id}`,
      status: camp.status || 'draft',
      metrics: {
        spend,
        impressions,
        clicks,
        ctr,
        cpc,
        conversions: Number(camp.conversions || 0),
        cost_per_conversion: 0,
        budget,
        pacing,
        score,
        alerts: { count: 0, severity: 'ok' },
      },
      ad_sets: adSets.map((as, adIdx) => {
        const asImpr = Number(as.impressions || 0);
        const asClicks = Number(as.clicks || 0);
        const asSpend = Number(as.spend || 0);
        const asBudget = Number(as.daily_budget || 0);
        const asCtr = asImpr > 0 ? (asClicks / asImpr) * 100 : Number(as.ctr || 0);
        const asCpc = asClicks > 0 ? asSpend / asClicks : Number(as.cpc || 0);
        const asPacing = asBudget > 0 ? Math.min(200, (asSpend / asBudget) * 100) : 0;
        const asScore = Math.min(100, Math.max(0, 75 + asCtr * 10 - asCpc / 2));

        return {
          id: String(as.adset_id || `${id}-${adIdx + 1}`),
          name: as.name || `Ad set ${adIdx + 1}`,
          metrics: {
            spend: asSpend,
            impressions: asImpr,
            clicks: asClicks,
            ctr: asCtr,
            cpc: asCpc,
            conversions: Number(as.conversions || 0),
            cost_per_conversion: 0,
            budget: asBudget,
            pacing: asPacing,
            score: asScore,
            alerts: { count: 0, severity: 'ok' },
          },
        };
      }),
    };
  });

  const totalSpend = campaigns.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + (c.metrics?.budget ?? 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (c.metrics?.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.metrics?.clicks ?? 0), 0);
  const platformCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const platformCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const platformPacing = totalBudget > 0 ? Math.min(200, (totalSpend / totalBudget) * 100) : 0;
  const platformScore = Math.min(100, Math.max(0, 75 + platformCtr * 10 - platformCpc / 2));

  const linked_accounts = (insights.ad_accounts ?? []).map((acc, i) => ({
    id: i + 1,
    external_id: String(acc.account_id ?? ''),
  }));

  const platformMetrics = {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: platformCtr,
    cpc: platformCpc,
    conversions: 0,
    cost_per_conversion: 0,
    budget: totalBudget,
    pacing: platformPacing,
    score: platformScore,
    alerts: { count: 0, severity: 'ok' },
  };

  return [
    {
      key: 'meta',
      display_name: 'Meta',
      account_ids: [],
      linked_accounts,
      metrics: platformMetrics,
      campaigns,
      _campaignAccountId: campaignAccountId,
    },
  ];
}

type GoogleAdsInsightsPayload = {
  connected: boolean;
  campaigns?: Array<{ campaign_id?: string; id?: string; name?: string; status?: string }>;
  ad_accounts?: Array<{ account_id?: string; account_name?: string }>;
};

function createGoogleAdsFallbackPlatforms(
  data: GoogleAdsInsightsPayload,
): PlatformWithCampaignAccountId[] {
  if (!data.connected) return [];
  const camps = data.campaigns ?? [];
  const accts = data.ad_accounts ?? [];
  if (camps.length === 0 && accts.length === 0) return [];

  const linked_accounts = accts.map((acc, i) => ({
    id: i + 1,
    external_id: String(acc.account_id ?? ''),
  }));

  const campaigns: HierarchyCampaignRow[] = camps.map((camp, idx) => {
    const raw = String(camp.campaign_id ?? camp.id ?? idx);
    const parsed = Number(raw.replace(/\D/g, '').slice(0, 15)) || 900_000_000 + idx;
    return {
      id: parsed,
      name: camp.name || `Campaign ${raw}`,
      status: String(camp.status || 'unknown').toLowerCase(),
      metrics: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        conversions: 0,
        cost_per_conversion: 0,
        budget: 0,
        pacing: 0,
        score: 60,
        alerts: { count: 0, severity: 'ok' },
      },
      ad_sets: [],
    };
  });

  const totalBudget = campaigns.reduce((s, c) => s + (c.metrics?.budget ?? 0), 0);
  const platformMetrics = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    conversions: 0,
    cost_per_conversion: 0,
    budget: totalBudget,
    pacing: 0,
    score: 60,
    alerts: { count: 0, severity: 'ok' },
  };

  return [
    {
      key: 'google',
      display_name: 'Google Ads',
      account_ids: accts.map((a) => String(a.account_id ?? '')).filter(Boolean),
      linked_accounts,
      metrics: platformMetrics,
      campaigns,
    },
  ];
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-light text-green' : score >= 60 ? 'bg-amber-light text-amber' : 'bg-red-light text-red';
  return <span className={`inline-flex items-center px-2 py-[2px] rounded-md text-[11.5px] font-semibold tabular-nums ${cls}`}>{score.toFixed(1)}</span>;
}

function PacingCell({ pacing, label }: { pacing: number; label: string }) {
  const barCls = pacing >= 90 ? 'bg-green' : pacing >= 83 ? 'bg-teal' : 'bg-coral';
  const textCls = pacing >= 90 ? 'text-green' : pacing >= 83 ? 'text-teal-deep' : 'text-coral';
  return (
    <div className="min-w-[110px]">
      <div className="w-full h-[5px] rounded-full bg-surface-secondary overflow-hidden mb-[3px]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.min(100, pacing)}%` }} />
      </div>
      <span className={`text-[10.5px] font-semibold ${textCls}`}>{pacing}% · {label}</span>
    </div>
  );
}

function AlertsCell({ count, severity }: { count: number; severity: string }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green">
        <span className="text-[11px]">✓</span> All Clear
      </span>
    );
  }
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral">
        <span className="text-[11px]">↑</span> {count} Critical
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber">
      <span className="text-[11px]">⚠</span> {count} Advisory
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const live = status.toLowerCase() === 'active' || status === 'Live';
  if (live) {
    return <span className="inline-flex items-center gap-[4px] text-[11px] font-semibold text-green">● Live</span>;
  }
  return <span className="inline-flex items-center gap-[4px] text-[11px] font-semibold text-amber">● Paused</span>;
}

function AiModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, { cls: string; icon: string }> = {
    auto: { cls: 'text-teal-deep', icon: '●' },
    hybrid: { cls: 'text-purple', icon: '◎' },
    manual: { cls: 'text-text-muted', icon: '◎' },
  };
  const s = styles[mode] || styles.manual;
  return (
    <span className={`inline-flex items-center gap-[3px] text-[11px] font-semibold capitalize ${s.cls}`}>
      {s.icon} {mode === 'auto' ? 'Auto' : mode === 'hybrid' ? 'Hybrid' : 'Manual'}
    </span>
  );
}

function MetricsRowCells({
  m,
}: {
  m: {
    score: number;
    spend: number;
    budget: number;
    cpc: number;
    ctr: number;
    conversions: number;
    cost_per_conversion: number;
    pacing: number;
    alerts: { count: number; severity: string };
  };
}) {
  const pl = pacingLabel(m.pacing);
  return (
    <>
      <td className="px-3 py-3"><ScoreBadge score={m.score} /></td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${m.spend.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${m.budget.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${m.cpc.toFixed(2)}</td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">{m.ctr.toFixed(1)}%</td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">{m.conversions.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${m.cost_per_conversion.toFixed(2)}</td>
      <td className="px-3 py-3"><PacingCell pacing={m.pacing} label={pl} /></td>
      <td className="px-3 py-3"><AlertsCell count={m.alerts.count} severity={m.alerts.severity} /></td>
    </>
  );
}

const inputClass = 'h-[40px] px-3 border border-border rounded-lg bg-surface-secondary text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal-deep/20 focus:border-teal-deep transition-colors';

export default function ClientsPage() {
  const router = useRouter();
  const { status } = useRequireAuth();
  const { clients: apiClients, isLoading: clientsLoading, refresh: refreshClients } = useClients();
  const { campaigns: agencyCampaigns } = useCampaigns();
  const { accessToken, agencyId } = useApiAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const {
    hierarchy,
    error: hierarchyError,
    isLoading: hierarchyLoading,
    refresh: refreshHierarchy,
  } = useClientHierarchy(period);

  const hier404 = (hierarchyError as ApiError | undefined)?.status === 404;
  const effectiveHierarchy = useMemo(() => {
    if (hierarchy) return hierarchy;
    if (hier404) return buildFallbackHierarchy(apiClients, period);
    return null;
  }, [hierarchy, hier404, apiClients, period]);

  const showFullSkeleton =
    (hierarchyLoading && !hierarchy && !hierarchyError) || (hier404 && clientsLoading);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [metaFallbackPlatformsByClient, setMetaFallbackPlatformsByClient] = useState<Record<number, PlatformWithCampaignAccountId[]>>({});
  const [googleFallbackPlatformsByClient, setGoogleFallbackPlatformsByClient] = useState<Record<number, PlatformWithCampaignAccountId[]>>({});
  const [metaLoadingClients, setMetaLoadingClients] = useState<Set<number>>(() => new Set());
  const [googleLoadingClients, setGoogleLoadingClients] = useState<Set<number>>(() => new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', industry: '', website: '' });
  const [saving, setSaving] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const allClients = effectiveHierarchy?.clients ?? [];

  const fallbackCampaignsByClientPlatform = useMemo(() => {
    const grouped = new Map<number, Map<string, HierarchyCampaignRow[]>>();
    for (const c of agencyCampaigns) {
      if (typeof c.client_id !== 'number') continue;
      const pKeys = c.platform_allocations ? Object.keys(c.platform_allocations) : [];
      if (pKeys.length === 0) continue;
      let byPlatform = grouped.get(c.client_id);
      if (!byPlatform) {
        byPlatform = new Map<string, HierarchyCampaignRow[]>();
        grouped.set(c.client_id, byPlatform);
      }
      for (const pk of pKeys) {
        const key = pk.toLowerCase();
        const arr = byPlatform.get(key) ?? [];
        arr.push(campaignToHierarchyFallback(c, key));
        byPlatform.set(key, arr);
      }
    }
    return grouped;
  }, [agencyCampaigns]);

  const clientDisplayMetricsById = useMemo(() => {
    const map = new Map<number, HierarchyClientRow['metrics']>();

    for (const c of allClients) {
      const base = c.metrics;
      let sourceCampaigns: HierarchyCampaignRow[] = [];

      const nativeCamps = c.platforms.flatMap((p) => p.campaigns);
      const metaPlatforms = metaFallbackPlatformsByClient[c.id] ?? [];
      const metaCamps = metaPlatforms.flatMap((p) => p.campaigns);
      const googlePlatforms = googleFallbackPlatformsByClient[c.id] ?? [];
      const googleCamps = googlePlatforms.flatMap((p) => p.campaigns);
      const fallbackMap = fallbackCampaignsByClientPlatform.get(c.id);
      const otherCamps = fallbackMap ? Array.from(fallbackMap.values()).flat() : [];

      sourceCampaigns = [...nativeCamps, ...metaCamps, ...googleCamps, ...otherCamps];

      const hasDetail =
        sourceCampaigns.length > 0 || (c.platforms.length > 0 && (base.spend > 0 || base.budget > 0));

      if (!hasDetail) {
        map.set(c.id, base);
        continue;
      }

      // If we have detail campaigns from fallbacks, aggregate them.
      // If we have detailed platforms from backend, they might already have empty campaign arrays (lazy).
      // If so, we should ONLY re-aggregate if campaigns.length > 0.
      if (sourceCampaigns.length === 0) {
        map.set(c.id, base);
        continue;
      }

      const aggSpend = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.spend ?? 0), 0);
      const aggBudget = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.budget ?? 0), 0);
      const aggImpr = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.impressions ?? 0), 0);
      const aggClicks = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.clicks ?? 0), 0);
      const aggConv = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.conversions ?? 0), 0);
      const aggAlerts = sourceCampaigns.reduce((s, camp) => s + (camp.metrics?.alerts?.count ?? 0), 0);
      const totalSpend = base.spend + aggSpend;
      const totalBudget = base.budget + aggBudget;
      const totalImpr = base.impressions + aggImpr;
      const totalClicks = base.clicks + aggClicks;
      const totalConv = base.conversions + aggConv;
      const totalAlerts = (base.alerts?.count ?? 0) + aggAlerts;
      
      const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const costPerConv = totalConv > 0 ? totalSpend / totalConv : 0;
      const pacing = totalBudget > 0 ? Math.min(200, (totalSpend / totalBudget) * 100) : 0;
      const score = Math.min(100, Math.max(0, 75 + ctr * 10 - cpc / 2));
      const alertSeverity = (base.alerts?.severity === 'critical' || sourceCampaigns.some(camp => camp.metrics?.alerts?.severity === 'critical')) 
        ? 'critical' 
        : (totalAlerts > 0 ? 'warning' : 'ok');

      map.set(c.id, {
        ...base,
        spend: totalSpend,
        budget: totalBudget,
        impressions: totalImpr,
        clicks: totalClicks,
        conversions: totalConv,
        ctr,
        cpc,
        cost_per_conversion: costPerConv,
        pacing,
        score,
        alerts: { count: totalAlerts, severity: alertSeverity },
      });
    }

    return map;
  }, [allClients, metaFallbackPlatformsByClient, googleFallbackPlatformsByClient, fallbackCampaignsByClientPlatform]);

  const needsActionCount = useMemo(
    () => allClients.filter((c) => (clientDisplayMetricsById.get(c.id)?.alerts.count ?? 0) > 0).length,
    [allClients, clientDisplayMetricsById],
  );
  const topCount = useMemo(
    () => allClients.filter((c) => (clientDisplayMetricsById.get(c.id)?.score ?? 0) >= 80).length,
    [allClients, clientDisplayMetricsById],
  );
  const manualCount = useMemo(
    () => allClients.filter((c) => aiModeFromAccountMode(c.account_mode) === 'manual').length,
    [allClients],
  );

  const filtered = useMemo(() => {
    let list = [...allClients];

    if (tab === 'needs_action') {
      list = list.filter((c) => (clientDisplayMetricsById.get(c.id)?.alerts.count ?? 0) > 0);
    } else if (tab === 'top') {
      list = list.filter((c) => (clientDisplayMetricsById.get(c.id)?.score ?? 0) >= 80);
    } else if (tab === 'manual_ai') {
      list = list.filter((c) => aiModeFromAccountMode(c.account_mode) === 'manual');
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        // Name/Industry match
        if (c.name.toLowerCase().includes(q) || (c.industry ?? '').toLowerCase().includes(q)) return true;

        // Platform match (native)
        if (c.platforms.some((p) => p.display_name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))) return true;

        // Platform match (fallback/Meta)
        const metaPlates = metaFallbackPlatformsByClient[c.id] ?? [];
        if (metaPlates.some((p) => p.display_name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))) return true;

        const googlePlates = googleFallbackPlatformsByClient[c.id] ?? [];
        if (googlePlates.some((p) => p.display_name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))) return true;

        const fallbackMap = fallbackCampaignsByClientPlatform.get(c.id);
        if (fallbackMap && Array.from(fallbackMap.keys()).some((pk) => pk.toLowerCase().includes(q))) return true;

        return false;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const am = clientDisplayMetricsById.get(a.id) ?? a.metrics;
      const bm = clientDisplayMetricsById.get(b.id) ?? b.metrics;

      if (sortKey === 'score') return (am.score - bm.score) * dir;
      if (sortKey === 'spend') return (am.spend - bm.spend) * dir;
      if (sortKey === 'alerts') return (am.alerts.count - bm.alerts.count) * dir;
      if (sortKey === 'ctr') return (am.ctr - bm.ctr) * dir;
      
      // Default stable sort by name
      return a.name.localeCompare(b.name) * dir;
    });
  }, [allClients, tab, search, sortKey, sortDir, clientDisplayMetricsById, metaFallbackPlatformsByClient, googleFallbackPlatformsByClient, fallbackCampaignsByClientPlatform]);

  // Footer counts are computed from whichever data source we have (hierarchy / fallbacks / lazy meta-insights).

  const computedCounts = useMemo(() => {
    let platforms = 0;
    let campaigns = 0;
    let ad_sets = 0;

    for (const client of filtered) {
      const dbPlatforms = client.platforms;
      const metaPlatforms = metaFallbackPlatformsByClient[client.id] ?? [];
      const googlePlatforms = googleFallbackPlatformsByClient[client.id] ?? [];
      const fallbackMap = fallbackCampaignsByClientPlatform.get(client.id);
      const dbKeys = new Set(dbPlatforms.map((p) => p.key));
      const metaExtra = metaPlatforms.filter((p) => !dbKeys.has(p.key));
      const googleExtra = googlePlatforms.filter((p) => !dbKeys.has(p.key) && !metaExtra.some((m) => m.key === p.key));

      platforms += dbPlatforms.length + metaExtra.length + googleExtra.length + (fallbackMap ? fallbackMap.size : 0);

      for (const p of dbPlatforms) {
        campaigns += p.campaigns.length;
        for (const camp of p.campaigns) {
          ad_sets += camp.ad_sets?.length ?? 0;
        }
      }

      for (const p of metaExtra) {
        campaigns += p.campaigns.length;
        for (const camp of p.campaigns) {
          ad_sets += camp.ad_sets?.length ?? 0;
        }
      }

      for (const p of googleExtra) {
        campaigns += p.campaigns.length;
        for (const camp of p.campaigns) {
          ad_sets += camp.ad_sets?.length ?? 0;
        }
      }

      for (const p of googlePlatforms) {
        const dbp = dbPlatforms.find((d) => d.key === p.key);
        const n = p.campaigns.length;
        const dbn = dbp?.campaigns.length ?? 0;
        if (n > dbn) campaigns += n - dbn;
      }

      if (fallbackMap) {
        for (const arr of fallbackMap.values()) {
          campaigns += arr.length;
        }
      }
    }

    return { platforms, campaigns, ad_sets };
  }, [filtered, metaFallbackPlatformsByClient, googleFallbackPlatformsByClient, fallbackCampaignsByClientPlatform]);

  const metaFailedClients = useRef<Set<number>>(new Set());
  const googleFailedClients = useRef<Set<number>>(new Set());

  const loadGoogleAdsFallbackForClient = useCallback(async (clientId: number) => {
    if (!accessToken || !agencyId) return;
    if (googleFailedClients.current.has(clientId)) return;

    setGoogleLoadingClients((prev) => {
      if (prev.has(clientId)) return prev;
      return new Set(prev).add(clientId);
    });

    try {
      const data = await apiClient.get<GoogleAdsInsightsPayload>(
        API_ENDPOINTS.GOOGLE_ADS.CLIENT_INSIGHTS(String(clientId)),
        { accessToken, agencyId },
      );
      const platforms = createGoogleAdsFallbackPlatforms(data);
      if (platforms.length > 0) {
        setGoogleFallbackPlatformsByClient((prev) => ({ ...prev, [clientId]: platforms }));
      } else if (!data.connected) {
        googleFailedClients.current.add(clientId);
      }
    } catch {
      googleFailedClients.current.add(clientId);
    } finally {
      setGoogleLoadingClients((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  }, [accessToken, agencyId]);

  const loadMetaFallbackForClient = useCallback(async (clientId: number) => {
    if (!accessToken || !agencyId) return;
    if (metaFailedClients.current.has(clientId)) return;

    setMetaFallbackPlatformsByClient((prev) => {
      if (prev[clientId]?.length) return prev; // already loaded
      return prev;
    });

    setMetaLoadingClients((prev) => {
      if (prev.has(clientId)) return prev;
      return new Set(prev).add(clientId);
    });

    try {
      const data = await apiClient.get<MetaInsights>(
        API_ENDPOINTS.META.CLIENT_INSIGHTS(String(clientId)),
        { accessToken, agencyId },
      );
      const platforms = createMetaFallbackPlatforms(data);
      if (platforms.length > 0) {
        setMetaFallbackPlatformsByClient((prev) => ({ ...prev, [clientId]: platforms }));
      } else {
        metaFailedClients.current.add(clientId);
      }
    } catch {
      // Mark as failed to prevent retries
      metaFailedClients.current.add(clientId);
    } finally {
      setMetaLoadingClients((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  }, [accessToken, agencyId]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(ev.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [profileMenuOpen]);

  if (status === 'loading') return <ClientsSkeleton />;
  if (status !== 'authenticated') return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function toggleKey(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAllKeys() {
    if (!effectiveHierarchy) return;
    const keys: string[] = [];
    for (const c of effectiveHierarchy.clients) {
      const cKey = `c-${c.id}`;
      keys.push(cKey);
      
      // Expand platforms (both native and fallback)
      const nativePlts = c.platforms.map(p => p.key);
      const metaPlts = (metaFallbackPlatformsByClient[c.id] ?? []).map(p => p.key);
      const googlePlts = (googleFallbackPlatformsByClient[c.id] ?? []).map(p => p.key);
      const fallbackMap = fallbackCampaignsByClientPlatform.get(c.id);
      const fallbackPlts = fallbackMap ? Array.from(fallbackMap.keys()) : [];
      
      const allPltKeys = Array.from(new Set([...nativePlts, ...metaPlts, ...googlePlts, ...fallbackPlts]));
      
      for (const pk of allPltKeys) {
        keys.push(`${cKey}-p-${pk}`);
      }
    }
    setExpanded(new Set(keys));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  async function handleCreate() {
    if (!formData.name.trim() || !agencyId || !accessToken) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.AGENCY.CLIENT_CREATE(agencyId),
        {
          name: formData.name.trim(),
          industry: formData.industry.trim() || null,
          website: formData.website.trim() || null,
        },
        { accessToken, agencyId },
      );
      toast.success('Client created');
      setAddOpen(false);
      setFormData({ name: '', industry: '', website: '' });
      await refreshClients();
      await refreshHierarchy();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allClients.length },
    { key: 'needs_action', label: 'Needs Action', count: needsActionCount },
    { key: 'top', label: 'Top Performers', count: topCount },
    { key: 'manual_ai', label: 'Manual AI', count: manualCount },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7D' },
    { key: 'mtd', label: 'MTD' },
    { key: '30d', label: 'Last 30D' },
  ];

  const sortPills: { key: SortKey; label: string }[] = [
    { key: 'score', label: 'Score' },
    { key: 'spend', label: 'Spend' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'ctr', label: 'CTR' },
  ];

  return (
    <>
      <DashboardHeader
        title="Clients"
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[13px]">🔍</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients..."
                className={`${inputClass} pl-8 w-[200px]`}
              />
            </div>
            <div ref={profileMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-full border-2 border-cream-border bg-white text-[12px] font-bold text-v-text-primary hover:border-v-teal transition-colors flex items-center justify-center"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Open profile menu"
              >
                <span className="w-7 h-7 rounded-full bg-v-teal text-white text-[10px] font-black flex items-center justify-center">
                  U
                </span>
              </button>
              {profileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[46px] w-44 rounded-xl border-2 border-cream-border bg-white shadow-lg overflow-hidden z-50"
                >
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

      <main className="flex-1 overflow-y-auto bg-cream p-6">
        <div className="max-w-[1400px] mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex gap-[6px]">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-[6px] rounded-lg text-[12px] font-medium transition-all ${
                    tab === t.key
                      ? 'bg-teal-deep text-white shadow-sm'
                      : 'bg-white text-text-secondary border border-border hover:border-aqua/40'
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-border mx-1" />

            <div className="flex gap-[4px]">
              {periods.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-[6px] rounded-lg text-[11.5px] font-medium transition-all ${
                    period === p.key
                      ? 'bg-teal-deep text-white shadow-sm'
                      : 'bg-white text-text-muted border border-border hover:border-aqua/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-medium text-text-muted">Sort by</span>
              {sortPills.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`px-2 py-[5px] rounded-md text-[11px] font-medium transition-all ${
                    sortKey === s.key ? 'bg-teal-deep text-white shadow-sm' : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {s.label}
                  {sortKey === s.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </button>
              ))}

              <div className="w-px h-5 bg-border mx-1" />

              <button
                type="button"
                onClick={expandAllKeys}
                className="px-2 py-[5px] text-[11px] font-medium text-text-secondary hover:bg-surface-hover rounded-md transition-colors"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="px-2 py-[5px] text-[11px] font-medium text-text-secondary hover:bg-surface-hover rounded-md transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          {hier404 && !hierarchyLoading && !clientsLoading && (
            <div className="rounded-xl border border-amber/40 bg-amber-light/50 px-4 py-3 text-[12.5px] text-text-primary">
              <span className="font-bold">Hierarchy API unavailable (404).</span>{' '}
              Showing clients from the list endpoint only (no platform tree / usage metrics). Restart the backend from the latest code, or open{' '}
              <a href="http://localhost:8000/docs" className="text-teal-deep font-semibold underline" target="_blank" rel="noreferrer">
                /docs
              </a>{' '}
              and confirm <code className="text-[11px] bg-white/60 px-1 rounded">GET /agency/&#123;agency_id&#125;/clients/hierarchy</code> exists.
            </div>
          )}

          {showFullSkeleton ? (
            <ClientsSkeleton />
          ) : hierarchyError && !hier404 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center shadow-sm">
              <p className="text-text-primary font-bold">Could not load client hierarchy</p>
              <button
                type="button"
                onClick={() => refreshHierarchy()}
                className="mt-3 text-teal-deep font-semibold text-[13px] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center shadow-sm">
              <p className="text-text-primary font-bold text-[15px]">No clients found</p>
              <p className="text-text-muted text-[13px] mt-2">
                {search ? `No matches for "${search}"` : apiClients.length === 0 ? 'Add a client to get started.' : 'Try adjusting filters.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-[40px] pl-4 pr-0 py-3" />
                      <th 
                        className="pl-2 pr-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-v-teal transition-colors"
                        onClick={() => toggleSort('score')}
                      >
                        Client / Name {sortKey === 'score' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th 
                        className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-v-teal transition-colors"
                        onClick={() => toggleSort('score')}
                      >
                        Score {sortKey === 'score' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th 
                        className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-v-teal transition-colors"
                        onClick={() => toggleSort('spend')}
                      >
                        Spend {sortKey === 'spend' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">Budget</th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">CPC</th>
                      <th 
                        className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-v-teal transition-colors"
                        onClick={() => toggleSort('ctr')}
                      >
                        CTR {sortKey === 'ctr' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">Conv.</th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">Cost/Conv.</th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider min-w-[120px]">Pacing</th>
                      <th 
                        className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-v-teal transition-colors"
                        onClick={() => toggleSort('alerts')}
                      >
                        Alerts {sortKey === 'alerts' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">AI Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const cKey = `c-${c.id}`;
                      const cOpen = expanded.has(cKey);
                      const m = c.metrics;
                      const ai = aiModeFromAccountMode(c.account_mode);
                      const live = c.is_active !== false;
                      const fallbackPlatformsMap = fallbackCampaignsByClientPlatform.get(c.id);
                      const metaFallbackPlatforms = metaFallbackPlatformsByClient[c.id] ?? [];
                      const googleFallbackPlatforms = googleFallbackPlatformsByClient[c.id] ?? [];
                      const displayMetrics = clientDisplayMetricsById.get(c.id) ?? m;
                      const derivedPlatforms = [
                        ...c.platforms,
                        ...(fallbackPlatformsMap
                          ? Array.from(fallbackPlatformsMap.entries()).map(([pk, campaigns]) =>
                              createSyntheticPlatform(pk, campaigns),
                            )
                          : []),
                        ...metaFallbackPlatforms,
                        ...googleFallbackPlatforms,
                      ];
                      return (
                        <Fragment key={cKey}>
                          <tr
                            className="border-b border-border-subtle hover:bg-surface-secondary/60 transition-colors group cursor-pointer"
                            onClick={() => {
                              const opening = !cOpen;
                              toggleKey(cKey);
                              if (opening) {
                                if (metaFallbackPlatforms.length === 0) void loadMetaFallbackForClient(c.id);
                                if (googleFallbackPlatforms.length === 0) void loadGoogleAdsFallbackForClient(c.id);
                              }
                            }}
                          >
                            <td className="pl-4 pr-0 py-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const opening = !cOpen;
                                  toggleKey(cKey);
                                  if (opening) {
                                    if (metaFallbackPlatforms.length === 0) void loadMetaFallbackForClient(c.id);
                                    if (googleFallbackPlatforms.length === 0) void loadGoogleAdsFallbackForClient(c.id);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary text-[11px] transition-transform shrink-0"
                                style={{ transform: cOpen ? 'rotate(90deg)' : undefined }}
                                aria-expanded={cOpen}
                                aria-label={cOpen ? 'Collapse client' : 'Expand client'}
                              >
                                ▶
                              </button>
                            </td>
                            <td className="pl-2 pr-3 py-3">
                              <Link
                                href={`/clients/${c.id}`}
                                className="flex items-center gap-3 min-w-0 flex-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div
                                  className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                  style={{ background: avatarColorFromId(c.id) }}
                                >
                                  {initialsFromName(c.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12.5px] font-semibold text-text-primary truncate group-hover:text-teal-deep transition-colors">{c.name}</div>
                                  <div className="text-[10.5px] text-text-muted truncate">{platformSubtitle(c)}</div>
                                </div>
                              </Link>
                            </td>
                            <MetricsRowCells m={displayMetrics} />
                            <td className="px-3 py-3">
                              <StatusBadge status={live ? 'Live' : 'Paused'} />
                            </td>
                            <td className="px-3 py-3">
                              <AiModeBadge mode={ai} />
                            </td>
                          </tr>
                          {cOpen && (
                            <ClientDetailedPlatforms
                              clientId={c.id}
                              period={period}
                              cKey={cKey}
                              fallbackPlatformsMap={fallbackPlatformsMap}
                              metaFallbackPlatforms={metaFallbackPlatforms}
                              googleFallbackPlatforms={googleFallbackPlatforms}
                              metaLoading={metaLoadingClients.has(c.id)}
                              googleLoading={googleLoadingClients.has(c.id)}
                              expanded={expanded}
                              onToggle={toggleKey}
                              fallbackCampaignsByClientPlatform={fallbackCampaignsByClientPlatform}
                              summaryPlatforms={c.platforms}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-secondary/50">
                <span className="text-[11.5px] text-text-muted font-medium">
                  Showing {filtered.length} of {allClients.length} clients
                  {computedCounts
                    ? ` · ${computedCounts.platforms} platforms · ${computedCounts.campaigns} campaigns · ${computedCounts.ad_sets} ad sets`
                    : ''}
                </span>
                {filtered.length < allClients.length && (
                  <button
                    type="button"
                    onClick={() => setTab('all')}
                    className="text-[11.5px] font-semibold text-teal-deep hover:underline"
                  >
                    View all {allClients.length} clients →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !saving && setAddOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl border border-border w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-bold text-text-primary">Add Client</h2>
              <button
                type="button"
                className="h-9 w-9 rounded-lg border border-border text-text-muted hover:bg-surface-secondary text-[18px] leading-none transition-colors"
                onClick={() => !saving && setAddOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">Client Name *</label>
                <input
                  className={`${inputClass} w-full`}
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">Industry</label>
                <input
                  className={`${inputClass} w-full`}
                  value={formData.industry}
                  onChange={(e) => setFormData((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. E-commerce"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">Website</label>
                <input
                  className={`${inputClass} w-full`}
                  value={formData.website}
                  onChange={(e) => setFormData((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                className="flex-1 h-[44px] rounded-lg border border-border bg-surface-secondary text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                onClick={() => !saving && setAddOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 h-[44px] rounded-lg bg-teal-deep text-white text-[13px] font-semibold hover:bg-teal-deep/90 disabled:opacity-50 transition-colors shadow-sm"
                disabled={!formData.name.trim() || saving}
                onClick={handleCreate}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientDetailedPlatforms({
  clientId,
  period,
  cKey,
  fallbackPlatformsMap,
  metaFallbackPlatforms,
  googleFallbackPlatforms,
  metaLoading,
  googleLoading,
  expanded,
  onToggle,
  fallbackCampaignsByClientPlatform,
  summaryPlatforms,
}: {
  clientId: number;
  period: string;
  cKey: string;
  fallbackPlatformsMap?: Map<string, HierarchyCampaignRow[]>;
  metaFallbackPlatforms: PlatformWithCampaignAccountId[];
  googleFallbackPlatforms: PlatformWithCampaignAccountId[];
  metaLoading: boolean;
  googleLoading: boolean;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  fallbackCampaignsByClientPlatform: Map<number, Map<string, HierarchyCampaignRow[]>>;
  summaryPlatforms: HierarchyPlatformRow[];
}) {
  const { hierarchy, isLoading } = useClientHierarchy(period, clientId, true);

  if (isLoading && !hierarchy) {
    return (
      <tr className="border-b border-border-subtle/40 bg-surface-secondary/20 text-[11.5px]">
        <td className="pl-4 pr-0 py-2" />
        <td className="pl-8 pr-3 py-2 text-text-muted italic" colSpan={12}>
          Loading detailed hierarchy...
        </td>
      </tr>
    );
  }

  const dbPlatforms = hierarchy?.clients?.[0]?.platforms ?? [];
  const effectivePlatformsMap = new Map<string, PlatformWithCampaignAccountId>();

  // Use a map to deduplicate by platform key, prioritizing the richest data
  [
    ...dbPlatforms,
    ...summaryPlatforms,
    ...((fallbackPlatformsMap && fallbackPlatformsMap.size > 0)
      ? Array.from(fallbackPlatformsMap.entries()).map(([pk, campaigns]) =>
          createSyntheticPlatform(pk, campaigns),
        )
      : []),
    ...metaFallbackPlatforms,
    ...googleFallbackPlatforms,
  ].forEach((p) => {
    if (!effectivePlatformsMap.has(p.key)) {
      effectivePlatformsMap.set(p.key, p);
    } else {
      // If we have dual data, try to merge or prefer the one with campaigns
      const existing = effectivePlatformsMap.get(p.key)!;
      if (p.campaigns.length > existing.campaigns.length) {
        effectivePlatformsMap.set(p.key, p);
      }
    }
  });

  const effectivePlatforms = Array.from(effectivePlatformsMap.values()).sort((a, b) => {
    const order: Record<string, number> = { meta: 0, tiktok: 1, google: 2, reddit: 3 };
    const oa = order[a.key] ?? 99;
    const ob = order[b.key] ?? 99;
    return oa - ob || a.display_name.localeCompare(b.display_name);
  });

  if (effectivePlatforms.length === 0) {
    return (
      <tr className="border-b border-border-subtle/40 bg-surface-secondary/20 text-[11.5px]">
        <td className="pl-4 pr-0 py-2" />
        <td className="pl-8 pr-3 py-2 text-text-muted" colSpan={12}>
          {metaLoading || googleLoading
            ? 'Loading platform data...'
            : 'No platform hierarchy data available for this client.'}
        </td>
      </tr>
    );
  }

  return (
    <>
      {effectivePlatforms.map((p) => (
        <PlatformRows
          key={`${cKey}-p-${p.key}`}
          cKey={cKey}
          clientId={clientId}
          platform={p}
          fallbackCampaigns={
            fallbackCampaignsByClientPlatform.get(clientId)?.get(p.key.toLowerCase()) ?? []
          }
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

function PlatformRows({
  cKey,
  clientId,
  platform,
  fallbackCampaigns,
  expanded,
  onToggle,
}: {
  cKey: string;
  clientId: number;
  platform: PlatformWithCampaignAccountId;
  fallbackCampaigns: HierarchyCampaignRow[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const pKey = `${cKey}-p-${platform.key}`;
  const pOpen = expanded.has(pKey);
  const m = platform.metrics;
  const campaigns = platform.campaigns.length > 0 ? platform.campaigns : fallbackCampaigns;
  const accountNodes = getPlatformAccountNodes(platform);

  return (
    <>
      <tr
        className="border-b border-border-subtle bg-surface-secondary/40 text-[12px] cursor-pointer"
        onClick={() => onToggle(pKey)}
      >
        <td className="pl-7 pr-0 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(pKey);
            }}
            className="w-6 h-6 flex items-center justify-center text-text-muted text-[10px]"
            style={{ transform: pOpen ? 'rotate(90deg)' : undefined }}
            aria-expanded={pOpen}
          >
            ▶
          </button>
        </td>
        <td className="pl-8 pr-3 py-2 text-text-secondary font-semibold" colSpan={1}>
          <div className="flex flex-col gap-1 min-w-0">
            <div>
              <span className="text-teal-deep">{platform.display_name}</span>
              <span className="text-text-muted font-medium text-[10px] ml-2">· client #{clientId}</span>
            </div>
            {(platform.linked_accounts?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-1 max-w-[420px]">
                {platform.linked_accounts!.map((acc) => (
                  <span
                    key={acc.id}
                    className="inline-flex px-1.5 py-0.5 rounded bg-surface-secondary text-[9.5px] font-mono text-text-muted truncate max-w-[200px]"
                    title={acc.external_id}
                  >
                    {acc.external_id || `id:${acc.id}`}
                  </span>
                ))}
              </div>
            ) : platform.account_ids.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-w-[420px]">
                {platform.account_ids.map((aid, i) => (
                  <span
                    key={`${aid}-${i}`}
                    className="inline-flex px-1.5 py-0.5 rounded bg-surface-secondary text-[9.5px] font-mono text-text-muted truncate max-w-[200px]"
                    title={aid}
                  >
                    {aid}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </td>
        <MetricsRowCells m={m} />
        <td className="px-3 py-2 text-text-muted">—</td>
        <td className="px-3 py-2 text-text-muted">—</td>
      </tr>
      {pOpen &&
        accountNodes.map((acc) => (
          <AccountRows
            key={`${pKey}-a-${acc.key}`}
            pKey={pKey}
            account={acc}
            campaigns={campaigns}
            campaignAccountId={platform._campaignAccountId}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function AccountRows({
  pKey,
  account,
  campaigns,
  campaignAccountId,
  expanded,
  onToggle,
}: {
  pKey: string;
  account: { key: string; label: string; sub?: string; matchId?: string };
  campaigns: HierarchyCampaignRow[];
  campaignAccountId?: Record<number, string>;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const aKey = `${pKey}-a-${account.key}`;
  const aOpen = expanded.has(aKey);
  const allKey = `${aKey}-all`;
  const showAll = expanded.has(allKey);
  const accountCampaigns =
    campaignAccountId && account.matchId
      ? campaigns.filter((c) => String(campaignAccountId[c.id] ?? '') === String(account.matchId))
      : campaigns;

  const visibleCampaigns = showAll ? accountCampaigns : accountCampaigns.slice(0, 4);
  const hasMoreCampaigns = accountCampaigns.length > 4;

  const totalSpend = accountCampaigns.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
  const totalBudget = accountCampaigns.reduce((s, c) => s + (c.metrics?.budget ?? 0), 0);
  const totalImpressions = accountCampaigns.reduce((s, c) => s + (c.metrics?.impressions ?? 0), 0);
  const totalClicks = accountCampaigns.reduce((s, c) => s + (c.metrics?.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const pacing = totalBudget > 0 ? Math.min(200, (totalSpend / totalBudget) * 100) : 0;
  const score = Math.min(100, Math.max(0, 75 + ctr * 10 - cpc / 2));
  const conversions = accountCampaigns.reduce((s, c) => s + (c.metrics?.conversions ?? 0), 0);
  const costPerConv = conversions > 0 ? totalSpend / conversions : 0;
  const alertCount = accountCampaigns.reduce((s, c) => s + (c.metrics?.alerts?.count ?? 0), 0);
  const alertSeverity = accountCampaigns.some((c) => c.metrics?.alerts?.severity === 'critical')
    ? 'critical'
    : alertCount > 0
      ? 'warning'
      : 'ok';

  const accountMetrics = {
    score,
    spend: totalSpend,
    budget: totalBudget,
    cpc,
    ctr,
    conversions,
    cost_per_conversion: costPerConv,
    pacing,
    alerts: { count: alertCount, severity: alertSeverity },
  };

  return (
    <>
      <tr
        className="border-b border-border-subtle/50 bg-surface-secondary/20 text-[11.5px] cursor-pointer"
        onClick={() => onToggle(aKey)}
      >
        <td className="pl-12 pr-0 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(aKey);
            }}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary text-[10px] transition-transform"
            style={{ transform: aOpen ? 'rotate(90deg)' : undefined }}
            aria-expanded={aOpen}
          >
            ▶
          </button>
        </td>
        <td className="pl-12 pr-3 py-2 text-text-secondary font-semibold">
          <div className="min-w-0">
            <div className="text-[11.5px] text-text-primary truncate">{account.label}</div>
            <div className="text-[10px] text-text-muted">{account.sub ?? 'Account'}</div>
          </div>
        </td>
        <MetricsRowCells m={accountMetrics} />
        <td className="px-3 py-2 text-text-muted">—</td>
        <td className="px-3 py-2 text-text-muted">—</td>
      </tr>
      {aOpen &&
        visibleCampaigns.map((camp) => (
          <CampaignRows
            key={`${aKey}-camp-${camp.id}`}
            pKey={aKey}
            campaign={camp}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
      {aOpen && hasMoreCampaigns && (
        <tr className="border-b border-border-subtle/40 bg-surface-secondary/30 text-[11px]">
          <td className="pl-4 pr-0 py-2" />
          <td className="pl-16 pr-3 py-2 text-text-secondary" colSpan={12}>
            <button
              type="button"
              onClick={() => onToggle(allKey)}
              className="text-[11px] font-semibold text-teal-deep hover:underline"
            >
              {showAll ? 'Show first 4 campaigns' : `View all ${accountCampaigns.length} campaigns`}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function CampaignRows({
  pKey,
  campaign,
  expanded,
  onToggle,
}: {
  pKey: string;
  campaign: HierarchyCampaignRow;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const campKey = `${pKey}-camp-${campaign.id}`;
  const campOpen = expanded.has(campKey);
  const m = campaign.metrics;
  const ads = campaign.ad_sets ?? [];
  const hasAds = ads.length > 0;

  return (
    <>
      <tr
        className="border-b border-border-subtle/60 bg-white text-[11.5px] cursor-pointer"
        onClick={() => {
          if (hasAds) onToggle(campKey);
        }}
      >
        <td className="pl-16 pr-0 py-2">
          {hasAds ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(campKey);
              }}
              className="w-6 h-6 flex items-center justify-center text-text-muted text-[10px]"
              style={{ transform: campOpen ? 'rotate(90deg)' : undefined }}
              aria-expanded={campOpen}
            >
              ▶
            </button>
          ) : (
            <span className="inline-block w-6" />
          )}
        </td>
        <td className="pl-12 pr-3 py-2 font-medium text-text-primary">{campaign.name}</td>
        <MetricsRowCells m={m} />
        <td className="px-3 py-2">
          <StatusBadge status={campaign.status} />
        </td>
        <td className="px-3 py-2 text-text-muted">—</td>
      </tr>
      {campOpen &&
        ads.map((ad) => (
          <tr key={`${campKey}-ad-${ad.id}`} className="border-b border-border-subtle/40 bg-surface-secondary/30 text-[11px]">
            <td className="pl-16 pr-0 py-1.5" />
            <td className="pl-16 pr-3 py-1.5 text-text-muted">{ad.name}</td>
            <MetricsRowCells m={ad.metrics} />
            <td className="px-3 py-1.5 text-text-muted">—</td>
            <td className="px-3 py-1.5 text-text-muted">—</td>
          </tr>
        ))}
    </>
  );
}

function ClientsSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border-subtle animate-pulse">
          <div className="w-6 h-6 bg-surface-secondary rounded" />
          <div className="w-[34px] h-[34px] bg-surface-secondary rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-surface-secondary rounded w-1/3" />
            <div className="h-2 bg-surface-secondary rounded w-1/4" />
          </div>
          <div className="h-4 w-10 bg-surface-secondary rounded" />
          <div className="h-4 w-14 bg-surface-secondary rounded" />
          <div className="h-4 w-14 bg-surface-secondary rounded" />
          <div className="h-4 w-10 bg-surface-secondary rounded" />
        </div>
      ))}
    </div>
  );
}
