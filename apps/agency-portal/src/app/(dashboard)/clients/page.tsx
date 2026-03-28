'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import Link from 'next/link';
import { useClientHierarchy, useClients, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient, type ApiError } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { buildFallbackHierarchy } from '@/lib/api/hierarchyFallback';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { toast } from 'sonner';
import type { HierarchyClientRow, HierarchyCampaignRow, HierarchyPlatformRow } from '@/lib/api/contracts';

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
  const live = status.toLowerCase() === 'active' || status === 'Live';
  if (live) {
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
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${m.spend.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${m.budget.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${m.cpc.toFixed(2)}</td>
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">{m.ctr.toFixed(1)}%</td>
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">{m.conversions.toLocaleString()}</td>
      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${m.cost_per_conversion.toFixed(2)}</td>
      <td className="px-3 py-3"><PacingCell pacing={m.pacing} label={pl} /></td>
      <td className="px-3 py-3"><AlertsCell count={m.alerts.count} severity={m.alerts.severity} /></td>
    </>
  );
}

const inputClass = 'h-[40px] px-3 border-2 border-cream-border rounded-[10px] bg-cream text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/25 focus:border-teal';

export default function ClientsPage() {
  const { status } = useRequireAuth();
  const { clients: apiClients, isLoading: clientsLoading, refresh: refreshClients } = useClients();
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

  const [addOpen, setAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', industry: '', website: '' });
  const [saving, setSaving] = useState(false);

  const allClients = effectiveHierarchy?.clients ?? [];

  const needsActionCount = useMemo(
    () => allClients.filter((c) => c.metrics.alerts.count > 0).length,
    [allClients],
  );
  const topCount = useMemo(() => allClients.filter((c) => c.metrics.score >= 80).length, [allClients]);
  const manualCount = useMemo(
    () => allClients.filter((c) => aiModeFromAccountMode(c.account_mode) === 'manual').length,
    [allClients],
  );

  const filtered = useMemo(() => {
    let list = [...allClients];

    if (tab === 'needs_action') list = list.filter((c) => c.metrics.alerts.count > 0);
    else if (tab === 'top') list = list.filter((c) => c.metrics.score >= 80);
    else if (tab === 'manual_ai') list = list.filter((c) => aiModeFromAccountMode(c.account_mode) === 'manual');

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.industry ?? '').toLowerCase().includes(q),
      );
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === 'score') return (a.metrics.score - b.metrics.score) * dir;
      if (sortKey === 'spend') return (a.metrics.spend - b.metrics.spend) * dir;
      if (sortKey === 'alerts') return (a.metrics.alerts.count - b.metrics.alerts.count) * dir;
      if (sortKey === 'ctr') return (a.metrics.ctr - b.metrics.ctr) * dir;
      return 0;
    });
  }, [allClients, tab, search, sortKey, sortDir]);

  const counts = effectiveHierarchy?.counts;

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
      for (const p of c.platforms) {
        const pKey = `${cKey}-p-${p.key}`;
        keys.push(pKey);
        for (const camp of p.campaigns) {
          const campKey = `${pKey}-camp-${camp.id}`;
          keys.push(campKey);
          for (const ad of camp.ad_sets ?? []) {
            keys.push(`${campKey}-ad-${ad.id}`);
          }
        }
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
            <button
              onClick={() => {
                setFormData({ name: '', industry: '', website: '' });
                setAddOpen(true);
              }}
              className="h-[40px] px-4 rounded-[10px] bg-teal text-white text-[12.5px] font-bold hover:bg-teal-dark transition-colors shrink-0"
            >
              + Add Client
            </button>
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

            <div className="flex gap-[4px]">
              {periods.map((p) => (
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
              <span className="text-[11px] font-bold text-text-muted">Sort by</span>
              {sortPills.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`px-2 py-[5px] rounded-md text-[11px] font-bold transition-colors ${
                    sortKey === s.key ? 'bg-teal text-white' : 'text-text-secondary hover:bg-cream-dark'
                  }`}
                >
                  {s.label}
                  {sortKey === s.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </button>
              ))}

              <div className="w-px h-5 bg-cream-border mx-1" />

              <button
                type="button"
                onClick={expandAllKeys}
                className="px-2 py-[5px] text-[11px] font-bold text-text-secondary hover:bg-cream-dark rounded-md"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="px-2 py-[5px] text-[11px] font-bold text-text-secondary hover:bg-cream-dark rounded-md"
              >
                Collapse All
              </button>
            </div>
          </div>

          {hier404 && !hierarchyLoading && !clientsLoading && (
            <div className="rounded-xl border-2 border-amber/40 bg-amber-light/50 px-4 py-3 text-[12.5px] text-text-primary">
              <span className="font-bold">Hierarchy API unavailable (404).</span>{' '}
              Showing clients from the list endpoint only (no platform tree / usage metrics). Restart the backend from the latest code, or open{' '}
              <a href="http://localhost:8000/docs" className="text-teal font-bold underline" target="_blank" rel="noreferrer">
                /docs
              </a>{' '}
              and confirm <code className="text-[11px] bg-white/60 px-1 rounded">GET /agency/&#123;agency_id&#125;/clients/hierarchy</code> exists.
            </div>
          )}

          {showFullSkeleton ? (
            <ClientsSkeleton />
          ) : hierarchyError && !hier404 ? (
            <div className="bg-white rounded-xl border-2 border-cream-border p-12 text-center">
              <p className="text-text-primary font-bold">Could not load client hierarchy</p>
              <button
                type="button"
                onClick={() => refreshHierarchy()}
                className="mt-3 text-teal font-bold text-[13px] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-cream-border p-12 text-center">
              <p className="text-text-primary font-bold text-[15px]">No clients found</p>
              <p className="text-text-muted text-[13px] mt-2">
                {search ? `No matches for "${search}"` : apiClients.length === 0 ? 'Add a client to get started.' : 'Try adjusting filters.'}
              </p>
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
                    {filtered.map((c) => {
                      const cKey = `c-${c.id}`;
                      const cOpen = expanded.has(cKey);
                      const m = c.metrics;
                      const ai = aiModeFromAccountMode(c.account_mode);
                      const live = c.is_active !== false;
                      return (
                        <Fragment key={cKey}>
                          <tr className="border-b border-cream-border/60 hover:bg-cream/30 transition-colors group">
                            <td className="pl-4 pr-0 py-3">
                              <button
                                type="button"
                                onClick={() => toggleKey(cKey)}
                                className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary text-[11px] transition-transform"
                                style={{ transform: cOpen ? 'rotate(90deg)' : undefined }}
                                aria-expanded={cOpen}
                              >
                                ▶
                              </button>
                            </td>
                            <td className="pl-2 pr-3 py-3">
                              <Link href={`/clients/${c.id}`} className="flex items-center gap-3 min-w-[220px]">
                                <div
                                  className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white shrink-0"
                                  style={{ background: avatarColorFromId(c.id) }}
                                >
                                  {initialsFromName(c.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12.5px] font-bold text-text-primary truncate group-hover:text-teal transition-colors">{c.name}</div>
                                  <div className="text-[10.5px] text-text-muted truncate">{platformSubtitle(c)}</div>
                                </div>
                              </Link>
                            </td>
                            <MetricsRowCells m={m} />
                            <td className="px-3 py-3">
                              <StatusBadge status={live ? 'Live' : 'Paused'} />
                            </td>
                            <td className="px-3 py-3">
                              <AiModeBadge mode={ai} />
                            </td>
                          </tr>
                          {cOpen &&
                            c.platforms.map((p) => (
                              <PlatformRows
                                key={`${cKey}-p-${p.key}`}
                                cKey={cKey}
                                clientId={c.id}
                                platform={p}
                                expanded={expanded}
                                onToggle={toggleKey}
                              />
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t-2 border-cream-border flex items-center justify-between bg-cream/30">
                <span className="text-[11.5px] text-text-muted font-semibold">
                  Showing {filtered.length} of {allClients.length} clients
                  {counts
                    ? ` · ${counts.platforms} platforms · ${counts.campaigns} campaigns · ${counts.ad_sets} ad sets`
                    : ''}
                </span>
                {filtered.length < allClients.length && (
                  <button
                    type="button"
                    onClick={() => setTab('all')}
                    className="text-[11.5px] font-bold text-teal hover:underline"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40"
          onClick={() => !saving && setAddOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl border-2 border-cream-border w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-extrabold text-text-primary">Add Client</h2>
              <button
                type="button"
                className="h-9 w-9 rounded-[10px] border-2 border-cream-border text-text-muted hover:bg-cream text-[18px] leading-none"
                onClick={() => !saving && setAddOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Client Name *</label>
                <input
                  className={`${inputClass} w-full`}
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Industry</label>
                <input
                  className={`${inputClass} w-full`}
                  value={formData.industry}
                  onChange={(e) => setFormData((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. E-commerce"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-text-secondary mb-1.5">Website</label>
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
                className="flex-1 h-[44px] rounded-[10px] border-2 border-cream-border bg-cream text-[13px] font-bold text-text-secondary"
                onClick={() => !saving && setAddOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 h-[44px] rounded-[10px] bg-teal text-white text-[13px] font-bold hover:bg-teal-dark disabled:opacity-50"
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

function PlatformRows({
  cKey,
  clientId,
  platform,
  expanded,
  onToggle,
}: {
  cKey: string;
  clientId: number;
  platform: HierarchyPlatformRow;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const pKey = `${cKey}-p-${platform.key}`;
  const pOpen = expanded.has(pKey);
  const m = platform.metrics;

  return (
    <>
      <tr className="border-b border-cream-border/50 bg-cream/40 text-[12px]">
        <td className="pl-4 pr-0 py-2">
          <button
            type="button"
            onClick={() => onToggle(pKey)}
            className="w-6 h-6 flex items-center justify-center text-text-muted text-[10px]"
            style={{ transform: pOpen ? 'rotate(90deg)' : undefined }}
            aria-expanded={pOpen}
          >
            ▶
          </button>
        </td>
        <td className="pl-8 pr-3 py-2 text-text-secondary font-bold" colSpan={1}>
          <span className="text-teal">{platform.display_name}</span>
          <span className="text-text-muted font-medium text-[10px] ml-2">· client #{clientId}</span>
        </td>
        <MetricsRowCells m={m} />
        <td className="px-3 py-2 text-text-muted">—</td>
        <td className="px-3 py-2 text-text-muted">—</td>
      </tr>
      {pOpen &&
        platform.campaigns.map((camp) => (
          <CampaignRows
            key={`${pKey}-camp-${camp.id}`}
            pKey={pKey}
            campaign={camp}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
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
      <tr className="border-b border-cream-border/40 bg-white text-[11.5px]">
        <td className="pl-4 pr-0 py-2">
          {hasAds ? (
            <button
              type="button"
              onClick={() => onToggle(campKey)}
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
        <td className="pl-12 pr-3 py-2 font-semibold text-text-primary">{campaign.name}</td>
        <MetricsRowCells m={m} />
        <td className="px-3 py-2">
          <StatusBadge status={campaign.status} />
        </td>
        <td className="px-3 py-2 text-text-muted">—</td>
      </tr>
      {campOpen &&
        ads.map((ad) => (
          <tr key={`${campKey}-ad-${ad.id}`} className="border-b border-cream-border/30 bg-cream/20 text-[11px]">
            <td className="pl-4 pr-0 py-1.5" />
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
    <div className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
      {[1, 2, 3, 4, 5].map((i) => (
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
