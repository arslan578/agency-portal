'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { useInsights, useInsightsSummary } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { type AIInsight } from '@/lib/api/contracts';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-light text-red',
  warning: 'bg-amber-light text-amber',
  opportunity: 'bg-teal-light text-teal-dark',
  anomaly: 'bg-purple-light text-purple',
};

const IMPACT_COLOR: Record<string, string> = {
  red: 'text-red',
  green: 'text-green',
  teal: 'text-teal-deep',
  amber: 'text-amber',
  purple: 'text-purple',
  default: 'text-text-muted',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'creative', label: 'Creative' },
  { key: 'budget', label: 'Budget' },
  { key: 'opportunity', label: 'Opportunities' },
  { key: 'anomaly', label: 'Anomalies' },
];

type SortMode = 'impact' | 'recent' | 'client';

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('impact');
  
  // Tracking actions locally for immediate UI feedback (optimistic/persisted status)
  const [localAppliedIds, setLocalAppliedIds] = useState<Set<string>>(new Set());
  const [localDismissedIds, setLocalDismissedIds] = useState<Set<string>>(new Set());
  const [isBulkApplying, setIsBulkApplying] = useState(false);

  const { insights, isLoading: insightsLoading, refresh: refreshInsights } = useInsights('pending');
  const { summary, refresh: refreshSummary } = useInsightsSummary();

  const clientsInInsights = useMemo(() => {
    const map = new Map<number, string>();
    insights.forEach(ins => {
      if (!map.has(ins.client_id)) map.set(ins.client_id, ins.client_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [insights]);

  const visibleInsights = useMemo(() => {
    let items = insights.filter((i) => !localDismissedIds.has(i.insight_id));
    
    // Category tab filtering
    if (activeTab === 'critical') {
      items = items.filter(i => i.severity === 'critical');
    } else if (activeTab === 'opportunity') {
      items = items.filter(i => i.severity === 'opportunity');
    } else if (activeTab === 'anomaly') {
      items = items.filter(i => i.severity === 'anomaly');
    } else if (activeTab !== 'all') {
      items = items.filter((i) => i.categories.includes(activeTab));
    }
    
    // Client dropdown filtering
    if (clientFilter !== 'all') {
      items = items.filter((i) => String(i.client_id) === clientFilter);
    }
    
    // Sorting
    return [...items].sort((a, b) => {
      if (sortMode === 'impact') return b.priority_score - a.priority_score;
      if (sortMode === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return a.client_name.localeCompare(b.client_name);
    });
  }, [insights, activeTab, clientFilter, sortMode, localDismissedIds]);

  const tabCounts = useMemo(() => {
    const live = insights.filter((i) => !localDismissedIds.has(i.insight_id));
    const counts: Record<string, number> = { all: live.length };
    
    live.forEach(ins => {
      // Severity based tabs
      if (ins.severity === 'critical') counts.critical = (counts.critical ?? 0) + 1;
      if (ins.severity === 'opportunity') counts.opportunity = (counts.opportunity ?? 0) + 1;
      if (ins.severity === 'anomaly') counts.anomaly = (counts.anomaly ?? 0) + 1;
      
      // Category based tabs
      ins.categories.forEach(cat => {
        counts[cat] = (counts[cat] ?? 0) + 1;
      });
    });
    
    return counts;
  }, [insights, localDismissedIds]);

  const handleApply = async (id: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.INSIGHTS.APPLY(id), {});
      setLocalAppliedIds(prev => new Set(prev).add(id));
      refreshSummary();
    } catch (err) {
      console.error('Failed to apply insight:', err);
      alert('Failed to apply action. Please try again.');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.INSIGHTS.DISMISS(id), {});
      setLocalDismissedIds(prev => new Set(prev).add(id));
      refreshSummary();
    } catch (err) {
      console.error('Failed to dismiss insight:', err);
    }
  };

  const handleApplyAll = async () => {
    const count = visibleInsights.filter(i => (i.severity === 'critical' || i.priority_score >= 0.8) && !localAppliedIds.has(i.insight_id)).length;
    if (count === 0) return;
    
    if (!confirm(`Are you sure you want to apply ${count} recommended optimizations at once?`)) return;
    
    setIsBulkApplying(true);
    try {
      const resp = await apiClient.post<any>(API_ENDPOINTS.INSIGHTS.APPLY_RECOMMENDED, {});
      if (resp.insight_ids) {
        setLocalAppliedIds(prev => {
          const next = new Set(prev);
          resp.insight_ids.forEach((id: string) => next.add(id));
          return next;
        });
      }
      refreshSummary();
      alert(`Successfully applied ${resp.applied_count} insights. ${resp.failed_count} failed.`);
    } catch (err) {
      console.error('Bulk apply failed:', err);
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleSeed = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.INSIGHTS.SEED, {});
      refreshInsights();
      refreshSummary();
    } catch (err) {
      console.error('Seeding failed:', err);
    }
  };

  const lastAnalysedText = useMemo(() => {
    if (!insights.length) return 'Recently';
    const dates = insights.map(i => new Date(i.created_at).getTime());
    const latest = Math.max(...dates);
    const diffMins = Math.floor((Date.now() - latest) / 60000);
    if (diffMins < 1) return 'Seconds ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    return `${Math.floor(diffMins / 60)} hrs ago`;
  }, [insights]);

  return (
    <div className="relative flex flex-col h-full bg-surface-secondary overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-24 bg-gradient-animate opacity-20 blur-3xl rounded-[48px]"
      />
      <DashboardHeader
        title="AI Insights"
        subtitle={`Cross-portfolio · ${summary?.clients_affected_count ?? 0} affected clients`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold text-text-muted">
              Last analysed: <strong className="text-text-primary">{lastAnalysedText}</strong>
            </span>
            <button
              type="button"
              onClick={() => { refreshInsights(); refreshSummary(); }}
              className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[12px] font-semibold border border-border bg-white text-text-primary hover:border-aqua hover:text-teal-deep transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={insightsLoading ? 'animate-spin' : ''}>
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" />
                <path d="M13.5 2.5v4h-4" />
              </svg>
              {insightsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            {insights.length === 0 && (
              <button 
                onClick={handleSeed}
                className="px-3 py-1.5 bg-v-teal/10 text-v-teal text-[11px] font-bold rounded-lg hover:bg-v-teal/20 transition-all border border-v-teal/20"
              >
                Seed Mock Data
              </button>
            )}
          </div>
        }
      />

      {/* Impact banner */}
      <div className="relative bg-v-teal text-white px-6 py-3.5 flex items-center gap-0 border-b border-white/10 shrink-0">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.18),transparent_55%)]"
        />
        {[
          { num: summary?.total_pending ?? '-', label: 'Insights pending' },
          { num: summary?.critical_count ?? '-', label: 'Critical issues' },
          { num: summary?.opportunity_count ?? '-', label: 'Opportunities' },
          { num: summary ? `$${(summary.recoverable_spend_cents / 100).toLocaleString()}` : '-', label: 'Recoverable spend' },
          { num: summary?.clients_affected_count ?? '-', label: 'Clients affected' },
        ].map((stat, idx) => (
          <div
            key={stat.label}
            className={`flex flex-col items-center px-6 ${idx < 4 ? 'border-r border-white/20' : ''} ${idx === 0 ? 'pl-0' : ''}`}
          >
              <span className="font-mono text-[22px] font-bold leading-none drop-shadow-[0_10px_18px_rgba(0,0,0,0.18)]">
                {stat.num}
              </span>
            <span className="text-[10px] font-semibold opacity-75 mt-[3px] tracking-[0.4px] uppercase whitespace-nowrap">
              {stat.label}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={handleApplyAll}
          disabled={isBulkApplying}
          className="ml-auto bg-white/10 border border-white/25 text-white rounded-lg px-4 py-2 text-[12px] font-semibold shadow-sm hover:bg-white/20 hover:shadow-md transition-all whitespace-nowrap disabled:opacity-50"
        >
          {isBulkApplying ? 'Applying...' : 'Apply All Recommended →'}
        </button>
      </div>

      {/* Content */}
      <main className="relative flex-1 overflow-auto p-5 space-y-4 scrollbar-hide">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white/70 border border-border-subtle rounded-2xl overflow-hidden shadow-sm p-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-[8px] text-[12px] font-semibold flex items-center gap-1.5 whitespace-nowrap rounded-xl transition-all ${
                  activeTab === tab.key
                    ? 'bg-v-teal text-white shadow-sm'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                {tab.label}
                <span
                  className={`text-[10px] font-extrabold px-[5px] py-px rounded ${
                    activeTab === tab.key ? 'bg-white/25' : 'bg-black/[0.12]'
                  }`}
                >
                  {tabCounts[tab.key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="bg-white border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary outline-none cursor-pointer shadow-sm"
            >
              <option value="all">All Clients</option>
              {clientsInInsights.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-white border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary outline-none cursor-pointer shadow-sm"
            >
              <option value="impact">Sort: Impact (High → Low)</option>
              <option value="recent">Sort: Most Recent</option>
              <option value="client">Sort: Client A–Z</option>
            </select>
          </div>
        </div>

        {/* Insights list */}
        <div className="flex flex-col gap-3">
          {visibleInsights.length === 0 && !insightsLoading && (
            <div className="bg-white border border-border rounded-2xl p-10 text-center shadow-sm">
              <p className="text-[14px] font-semibold text-text-muted">No pending insights match the current filters.</p>
            </div>
          )}

          {visibleInsights.map((ins) => {
            const isApplied = localAppliedIds.has(ins.insight_id) || ins.status === 'applied';
            return (
              <div
                key={ins.insight_id}
                className={`bg-white border border-border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  isApplied ? 'opacity-60 grayscale-[0.3]' : ''
                }`}
              >
                {/* Accent bar */}
                <div className={`h-[4px] w-full bg-v-${ins.accent_color}`} />

                <div className="p-4 px-[18px] flex gap-3.5 items-start">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-[18px] shrink-0 bg-v-${ins.icon_bg}`}
                  >
                    {ins.icon}
                  </div>

                  {/* Main */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2.5 mb-2">
                      <h3 className="text-[14px] font-black text-v-text-primary leading-[1.3] flex-1">
                        {ins.title}
                      </h3>
                      <span
                      className={`shrink-0 text-[10px] font-bold tracking-[0.8px] uppercase px-2 py-[3px] rounded-[5px] ${SEVERITY_BADGE[ins.severity] ?? ''}`}
                      >
                        {ins.severity}
                      </span>
                    </div>

                    <p className="text-[12.5px] text-v-text-secondary leading-[1.55] mb-2.5 font-medium">
                      {ins.description}
                    </p>

                    {/* Meta tags */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-[3px] rounded-[5px] bg-v-coral-light text-v-coral border border-v-coral/10">
                         {ins.client_short_name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-[3px] rounded-[5px] bg-v-aqua/10 text-v-aqua border border-v-aqua/10 uppercase">
                        {ins.platform_label}
                      </span>
                      {ins.categories.map(cat => (
                        <span key={cat} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-[3px] rounded-[5px] bg-cream-border/30 text-text-muted border border-cream-border/50 uppercase">
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Impact grid */}
                    <div className="bg-cream/40 border border-cream-border/50 rounded-xl px-3.5 py-2.5 flex gap-5 flex-wrap mb-3">
                      {ins.impact_metrics.map((m) => (
                        <div key={m.label} className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-[0.6px] text-text-muted">
                            {m.label}
                          </span>
                          <span className={`font-mono text-[13px] font-bold ${IMPACT_COLOR[m.color] ?? 'text-text-primary'}`}>
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    {isApplied ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-v-green bg-v-green/10 rounded-md px-3 py-1.5 border border-v-green/20">
                        ✓ Applied — monitoring results
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApply(ins.insight_id)}
                          className="bg-v-teal text-white border-none rounded-lg px-[18px] py-2 text-[12px] font-bold hover:bg-v-teal-dark transition-all shadow-sm"
                        >
                          {ins.apply_label || 'Apply Optimization'}
                        </button>
                        {ins.review_url && (
                           <Link
                            href={ins.review_url}
                            className="bg-white text-v-text-primary border-2 border-cream-border rounded-lg px-4 py-[7.5px] text-[12px] font-bold hover:border-v-teal transition-all shadow-sm"
                           >
                            {ins.review_label || 'Review'}
                           </Link>
                        )}
                        <Link
                          href={`/clients/${ins.client_id}`}
                          className="text-v-coral text-[11.5px] font-bold hover:underline px-2"
                        >
                          Open {ins.client_short_name} →
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDismiss(ins.insight_id)}
                          className="ml-auto text-text-muted text-[12px] font-bold px-2.5 py-[7px] rounded-lg hover:bg-red-light hover:text-red transition-all"
                        >
                          Dismiss ×
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Side priority */}
                  <div className="shrink-0 flex flex-col items-end gap-1.3 pt-0.5 opacity-40">
                     <div className="w-1.5 h-1.5 rounded-full bg-border" />
                     <div className="w-1.5 h-1.5 rounded-full bg-border" />
                     <div className="w-1.5 h-1.5 rounded-full bg-border" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
