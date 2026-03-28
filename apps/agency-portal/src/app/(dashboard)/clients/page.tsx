'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import Link from 'next/link';
import { useClients, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { toast } from 'sonner';
import { MOCK_CLIENTS } from '@/lib/mock/dashboard';
import type { Client } from '@/lib/api/contracts';

type TabFilter = 'all' | 'needs_action' | 'top' | 'manual_ai';
type SortKey = 'score' | 'spend' | 'alerts' | 'ctr';
type Period = 'today' | '7d' | 'mtd' | '30d';

interface DisplayClient {
  id: number;
  name: string;
  type: string;
  initials: string;
  color: string;
  score: number;
  spend: number;
  budget: number;
  cpc: number;
  ctr: number;
  conversions: number;
  costPerConv: number;
  pacing: number;
  pacingLabel: string;
  alerts: { count: number; severity: string };
  aiMode: string;
  status: string;
  platforms: number;
  platformType: string;
  is_active?: boolean;
  website?: string | null;
  industry?: string | null;
}

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

const EXTRA_MOCK: Record<number, { budget: number; cpc: number; ctr: number; conversions: number; costPerConv: number; platforms: number; platformType: string }> = {
  1: { budget: 15000, cpc: 3.92, ctr: 0.9, conversions: 312, costPerConv: 39.74, platforms: 3, platformType: 'Shopify' },
  2: { budget: 20000, cpc: 1.14, ctr: 4.2, conversions: 1632, costPerConv: 11.40, platforms: 4, platformType: 'Shopify' },
  3: { budget: 12000, cpc: 2.14, ctr: 2.2, conversions: 488, costPerConv: 21.40, platforms: 2, platformType: 'Shopify' },
  4: { budget: 18000, cpc: 2.80, ctr: 1.4, conversions: 520, costPerConv: 27.12, platforms: 3, platformType: 'WooCommerce' },
  5: { budget: 8000, cpc: 1.42, ctr: 3.6, conversions: 480, costPerConv: 14.17, platforms: 2, platformType: 'Shopify' },
  6: { budget: 5000, cpc: 0.98, ctr: 4.8, conversions: 428, costPerConv: 9.81, platforms: 1, platformType: 'Shopify' },
  7: { budget: 14000, cpc: 2.36, ctr: 1.8, conversions: 474, costPerConv: 23.63, platforms: 3, platformType: 'BigCommerce' },
  8: { budget: 9000, cpc: 1.18, ctr: 3.4, conversions: 628, costPerConv: 11.78, platforms: 2, platformType: 'Squarespace' },
  9: { budget: 7000, cpc: 1.56, ctr: 2.8, conversions: 352, costPerConv: 15.63, platforms: 2, platformType: 'Shopify' },
  10: { budget: 10000, cpc: 1.72, ctr: 3.1, conversions: 464, costPerConv: 17.24, platforms: 3, platformType: 'Shopify' },
  11: { budget: 5500, cpc: 1.32, ctr: 3.2, conversions: 340, costPerConv: 13.24, platforms: 1, platformType: 'WooCommerce' },
  12: { budget: 14000, cpc: 2.52, ctr: 1.6, conversions: 436, costPerConv: 25.23, platforms: 2, platformType: 'Custom' },
};

function buildDisplayClients(apiClients: Client[]): DisplayClient[] {
  if (apiClients.length > 0) {
    return apiClients.map((c, i) => {
      const m = MOCK_CLIENTS[i % MOCK_CLIENTS.length];
      const extra = EXTRA_MOCK[(i % 12) + 1] || EXTRA_MOCK[1];
      return {
        id: c.id,
        name: c.name?.trim() || m.name,
        type: c.industry?.trim() || m.type,
        initials: initialsFromName(c.name || m.name),
        color: m.color,
        score: m.score,
        spend: m.spend,
        budget: extra.budget,
        cpc: extra.cpc,
        ctr: extra.ctr,
        conversions: extra.conversions,
        costPerConv: extra.costPerConv,
        pacing: m.pacing,
        pacingLabel: pacingLabel(m.pacing),
        alerts: m.alerts,
        aiMode: c.account_mode === 'reporting_only' ? 'manual' : c.account_mode === 'kaivo_managed' ? 'auto' : m.aiMode,
        status: c.is_active !== false ? 'Live' : 'Paused',
        platforms: extra.platforms,
        platformType: extra.platformType,
        is_active: c.is_active,
        website: c.website,
        industry: c.industry,
      };
    });
  }
  return MOCK_CLIENTS.map((m) => {
    const extra = EXTRA_MOCK[m.id] || EXTRA_MOCK[1];
    return {
      ...m,
      budget: extra.budget,
      cpc: extra.cpc,
      ctr: extra.ctr,
      conversions: extra.conversions,
      costPerConv: extra.costPerConv,
      pacingLabel: pacingLabel(m.pacing),
      status: 'Live',
      platforms: extra.platforms,
      platformType: extra.platformType,
    };
  });
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-light text-green' : score >= 60 ? 'bg-amber-light text-amber' : 'bg-red-light text-red';
  return <span className={`inline-flex items-center px-[7px] py-[2px] rounded-[6px] text-[11.5px] font-bold tabular-nums ${cls}`}>{score.toFixed(1)}</span>;
}

function PacingCell({ pacing, label }: { pacing: number; label: string }) {
  const barCls = pacing >= 90 ? 'bg-green' : pacing >= 83 ? 'bg-teal' : 'bg-coral';
  const textCls = pacing >= 90 ? 'text-green' : pacing >= 83 ? 'text-teal' : 'text-coral';
  return (
    <div className="min-w-[110px]">
      <div className="w-full h-[5px] rounded-full bg-cream-dark overflow-hidden mb-[3px]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.min(100, pacing)}%` }} />
      </div>
      <span className={`text-[10.5px] font-bold ${textCls}`}>{pacing}% · {label}</span>
    </div>
  );
}

function AlertsCell({ count, severity }: { count: number; severity: string }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green">
        <span className="text-[11px]">✓</span> All Clear
      </span>
    );
  }
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-coral">
        <span className="text-[11px]">↑</span> {count} Critical
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber">
      <span className="text-[11px]">⚠</span> {count} Advisory
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Live') {
    return <span className="inline-flex items-center gap-[4px] text-[11px] font-bold text-green">● Live</span>;
  }
  return <span className="inline-flex items-center gap-[4px] text-[11px] font-bold text-amber">● Paused</span>;
}

function AiModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, { cls: string; icon: string }> = {
    auto: { cls: 'text-teal', icon: '●' },
    hybrid: { cls: 'text-purple', icon: '◎' },
    manual: { cls: 'text-text-muted', icon: '◎' },
  };
  const s = styles[mode] || styles.manual;
  return (
    <span className={`inline-flex items-center gap-[3px] text-[11px] font-bold capitalize ${s.cls}`}>
      {s.icon} {mode === 'auto' ? 'Auto' : mode === 'hybrid' ? 'Hybrid' : 'Manual'}
    </span>
  );
}

const inputClass = 'h-[40px] px-3 border-2 border-cream-border rounded-[10px] bg-cream text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/25 focus:border-teal';

export default function ClientsPage() {
  const { status } = useRequireAuth();
  const { clients: apiClients, error, isLoading, refresh } = useClients();
  const { accessToken, agencyId } = useApiAuth();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');
  const [period, setPeriod] = useState<Period>('7d');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', industry: '', website: '' });
  const [saving, setSaving] = useState(false);

  const allClients = useMemo(() => buildDisplayClients(apiClients), [apiClients]);

  const needsActionCount = useMemo(() => allClients.filter(c => c.alerts.count > 0).length, [allClients]);
  const topCount = useMemo(() => allClients.filter(c => c.score >= 80).length, [allClients]);
  const manualCount = useMemo(() => allClients.filter(c => c.aiMode === 'manual').length, [allClients]);

  const filtered = useMemo(() => {
    let list = allClients;

    if (tab === 'needs_action') list = list.filter(c => c.alerts.count > 0);
    else if (tab === 'top') list = list.filter(c => c.score >= 80);
    else if (tab === 'manual_ai') list = list.filter(c => c.aiMode === 'manual');

    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'score') return (a.score - b.score) * dir;
      if (sortKey === 'spend') return (a.spend - b.spend) * dir;
      if (sortKey === 'alerts') return (a.alerts.count - b.alerts.count) * dir;
      if (sortKey === 'ctr') return (a.ctr - b.ctr) * dir;
      return 0;
    });
  }, [allClients, tab, search, sortKey, sortDir]);

  const totalPlatforms = useMemo(() => allClients.reduce((s, c) => s + c.platforms, 0), [allClients]);
  const totalCampaigns = useMemo(() => Math.round(allClients.length * 1.17), [allClients]);
  const totalAdSets = useMemo(() => Math.round(allClients.length * 1.83), [allClients]);

  if (status === 'loading') return <ClientsSkeleton />;
  if (status !== 'authenticated') return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() { setExpandedRows(new Set(filtered.map(c => c.id))); }
  function collapseAll() { setExpandedRows(new Set()); }

  async function handleCreate() {
    if (!formData.name.trim() || !agencyId || !accessToken) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.AGENCY.CLIENT_CREATE(agencyId), {
        name: formData.name.trim(),
        industry: formData.industry.trim() || null,
        website: formData.website.trim() || null,
      }, { accessToken, agencyId });
      toast.success('Client created');
      setAddOpen(false);
      setFormData({ name: '', industry: '', website: '' });
      await refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to create');
    } finally { setSaving(false); }
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
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                className={`${inputClass} pl-8 w-[200px]`}
              />
            </div>
            <button
              onClick={() => { setFormData({ name: '', industry: '', website: '' }); setAddOpen(true); }}
              className="h-[40px] px-4 rounded-[10px] bg-teal text-white text-[12.5px] font-bold hover:bg-teal-dark transition-colors shrink-0"
            >
              + Add Client
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto bg-cream p-6">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* Filter Tabs + Period + Sort Row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Tab filters */}
            <div className="flex gap-[6px]">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-[6px] rounded-lg text-[12px] font-bold transition-colors ${
                    tab === t.key
                      ? 'bg-teal text-white'
                      : 'bg-white text-text-secondary border border-cream-border hover:border-teal/30'
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-cream-border mx-1" />

            {/* Period filters */}
            <div className="flex gap-[4px]">
              {periods.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-[6px] rounded-lg text-[11.5px] font-bold transition-colors ${
                    period === p.key
                      ? 'bg-teal text-white'
                      : 'bg-white text-text-muted border border-cream-border hover:border-teal/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Sort pills */}
              <span className="text-[11px] font-bold text-text-muted">Sort by</span>
              {sortPills.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`px-2 py-[5px] rounded-md text-[11px] font-bold transition-colors ${
                    sortKey === s.key
                      ? 'bg-teal text-white'
                      : 'text-text-secondary hover:bg-cream-dark'
                  }`}
                >
                  {s.label}{sortKey === s.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </button>
              ))}

              <div className="w-px h-5 bg-cream-border mx-1" />

              <button onClick={expandAll} className="px-2 py-[5px] text-[11px] font-bold text-text-secondary hover:bg-cream-dark rounded-md">Expand All</button>
              <button onClick={collapseAll} className="px-2 py-[5px] text-[11px] font-bold text-text-secondary hover:bg-cream-dark rounded-md">Collapse All</button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <ClientsSkeleton />
          ) : error ? (
            <div className="bg-white rounded-xl border-2 border-cream-border p-12 text-center">
              <p className="text-text-primary font-bold">Could not load clients</p>
              <button onClick={() => refresh()} className="mt-3 text-teal font-bold text-[13px] hover:underline">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-cream-border p-12 text-center">
              <p className="text-text-primary font-bold text-[15px]">No clients found</p>
              <p className="text-text-muted text-[13px] mt-2">{search ? `No matches for "${search}"` : 'Try adjusting filters.'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-cream-border">
                      <th className="w-[40px] pl-4 pr-0 py-3" />
                      <th className="pl-2 pr-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Client / Name</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Score</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Spend</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Budget</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">CPC</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">CTR</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Conv.</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Cost/Conv.</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider min-w-[120px]">Pacing</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Alerts</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-[10.5px] font-bold text-text-muted uppercase tracking-wider">AI Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const isExpanded = expandedRows.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-cream-border/60 hover:bg-cream/30 transition-colors group"
                        >
                          <td className="pl-4 pr-0 py-3">
                            <button
                              onClick={() => toggleRow(c.id)}
                              className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary text-[11px] transition-transform"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                            >
                              ▶
                            </button>
                          </td>
                          <td className="pl-2 pr-3 py-3">
                            <Link href={`/clients/${c.id}`} className="flex items-center gap-3 min-w-[220px]">
                              <div
                                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white shrink-0"
                                style={{ background: c.color }}
                              >
                                {c.initials}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12.5px] font-bold text-text-primary truncate group-hover:text-teal transition-colors">{c.name}</div>
                                <div className="text-[10.5px] text-text-muted truncate">{c.platformType} · {c.type} · {c.platforms} platform{c.platforms !== 1 ? 's' : ''}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 py-3"><ScoreBadge score={c.score} /></td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.spend.toLocaleString()}</td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.budget.toLocaleString()}</td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.cpc.toFixed(2)}</td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">{c.ctr.toFixed(1)}%</td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">{c.conversions.toLocaleString()}</td>
                          <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.costPerConv.toFixed(2)}</td>
                          <td className="px-3 py-3"><PacingCell pacing={c.pacing} label={c.pacingLabel} /></td>
                          <td className="px-3 py-3"><AlertsCell count={c.alerts.count} severity={c.alerts.severity} /></td>
                          <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                          <td className="px-3 py-3"><AiModeBadge mode={c.aiMode} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t-2 border-cream-border flex items-center justify-between bg-cream/30">
                <span className="text-[11.5px] text-text-muted font-semibold">
                  Showing {filtered.length} of {allClients.length} clients · {totalPlatforms} platforms · {totalCampaigns} campaigns · {totalAdSets} ad sets
                </span>
                {filtered.length < allClients.length && (
                  <button onClick={() => setTab('all')} className="text-[11.5px] font-bold text-teal hover:underline">
                    View all {allClients.length} clients →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Client Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40" onClick={() => !saving && setAddOpen(false)}>
          <div className="bg-white rounded-xl border-2 border-cream-border w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-extrabold text-text-primary">Add Client</h2>
              <button className="h-9 w-9 rounded-[10px] border-2 border-cream-border text-text-muted hover:bg-cream text-[18px] leading-none" onClick={() => !saving && setAddOpen(false)}>×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Client Name *</label>
                <input className={`${inputClass} w-full`} value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Corp" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Industry</label>
                <input className={`${inputClass} w-full`} value={formData.industry} onChange={e => setFormData(f => ({ ...f, industry: e.target.value }))} placeholder="e.g. E-commerce" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Website</label>
                <input className={`${inputClass} w-full`} value={formData.website} onChange={e => setFormData(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="flex-1 h-[44px] rounded-[10px] border-2 border-cream-border bg-cream text-[13px] font-bold text-text-secondary" onClick={() => !saving && setAddOpen(false)}>Cancel</button>
              <button className="flex-1 h-[44px] rounded-[10px] bg-teal text-white text-[13px] font-bold hover:bg-teal-dark disabled:opacity-50" disabled={!formData.name.trim() || saving} onClick={handleCreate}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientsSkeleton() {
  return (
    <div className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-cream-border/50 animate-pulse">
          <div className="w-6 h-6 bg-cream-dark rounded" />
          <div className="w-[34px] h-[34px] bg-cream-dark rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-cream-dark rounded w-1/3" />
            <div className="h-2 bg-cream-dark rounded w-1/4" />
          </div>
          <div className="h-4 w-10 bg-cream-dark rounded" />
          <div className="h-4 w-14 bg-cream-dark rounded" />
          <div className="h-4 w-14 bg-cream-dark rounded" />
          <div className="h-4 w-10 bg-cream-dark rounded" />
        </div>
      ))}
    </div>
  );
}
