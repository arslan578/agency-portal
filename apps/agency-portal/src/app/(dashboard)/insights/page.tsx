'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import {
  MOCK_INSIGHTS_FULL,
  INSIGHT_FILTER_TABS,
  INSIGHT_CLIENTS,
  type MockInsight,
} from '@/lib/mock/insights';
import { useClients } from '@/hooks/useAgencyApi';

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-light text-red',
  high: 'bg-amber-light text-amber',
  opportunity: 'bg-teal-light text-teal-dark',
  anomaly: 'bg-purple-light text-purple',
};

const IMPACT_COLOR: Record<string, string> = {
  red: 'text-red',
  green: 'text-green',
  teal: 'text-teal-deep',
  amber: 'text-amber',
  purple: 'text-purple',
};

type SortMode = 'impact' | 'recent' | 'client';

function sortInsights(items: MockInsight[], mode: SortMode): MockInsight[] {
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, anomaly: 2, opportunity: 3 };
  if (mode === 'impact') {
    return [...items].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  }
  if (mode === 'recent') return [...items].sort((a, b) => a.id - b.id);
  return [...items].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('impact');
  const [appliedIds, setAppliedIds] = useState<Set<number>>(() => new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => new Set());

  const { clients } = useClients();
  const clientCount = clients.length || 12;

  const visibleInsights = useMemo(() => {
    let items = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id));
    if (activeTab !== 'all') items = items.filter((i) => i.categories.includes(activeTab));
    if (clientFilter !== 'all') items = items.filter((i) => i.clientKey === clientFilter);
    return sortInsights(items, sortMode);
  }, [activeTab, clientFilter, sortMode, dismissedIds]);

  const pendingCount = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id) && !appliedIds.has(i.id)).length;
  const criticalCount = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id) && i.priority === 'critical').length;
  const oppCount = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id) && i.priority === 'opportunity').length;
  const affectedClients = new Set(MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id)).map((i) => i.clientKey)).size;

  const tabCounts = useMemo(() => {
    const live = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id));
    const counts: Record<string, number> = { all: live.length };
    for (const i of live) {
      for (const cat of i.categories) {
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
    }
    return counts;
  }, [dismissedIds]);

  const handleApply = useCallback((id: number) => {
    setAppliedIds((prev) => new Set(prev).add(id));
  }, []);

  const handleDismiss = useCallback((id: number) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const handleApplyAll = useCallback(() => {
    const pending = MOCK_INSIGHTS_FULL.filter((i) => !dismissedIds.has(i.id) && !appliedIds.has(i.id));
    setAppliedIds((prev) => {
      const next = new Set(prev);
      pending.forEach((i) => next.add(i.id));
      return next;
    });
  }, [dismissedIds, appliedIds]);

  return (
    <div className="relative flex flex-col h-full bg-surface-secondary overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-24 bg-gradient-animate opacity-20 blur-3xl rounded-[48px]"
      />
      <DashboardHeader
        title="AI Insights"
        subtitle={`Cross-portfolio · ${clientCount} clients`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold text-text-muted">
              Last analysed: <strong className="text-text-primary">4 mins ago</strong>
            </span>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[12px] font-semibold border border-border bg-white text-text-primary hover:border-aqua hover:text-teal-deep transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" />
                <path d="M13.5 2.5v4h-4" />
              </svg>
              Refresh
            </button>
          </div>
        }
      />

      {/* Impact banner */}
      <div className="relative bg-gradient-to-r from-teal-deep via-teal-deep to-teal text-white px-6 py-3.5 flex items-center gap-0 border-b border-white/10 shrink-0">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.18),transparent_55%)]"
        />
        {[
          { num: String(pendingCount), label: 'Insights pending' },
          { num: String(criticalCount), label: 'Critical issues' },
          { num: String(oppCount), label: 'Opportunities' },
          { num: '$6,240', label: 'Recoverable spend' },
          { num: String(affectedClients), label: 'Clients affected' },
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
            className="ml-auto bg-white/10 border border-white/25 text-white rounded-lg px-4 py-2 text-[12px] font-semibold shadow-sm hover:bg-white/20 hover:shadow-md transition-all whitespace-nowrap"
        >
          Apply All Recommended →
        </button>
      </div>

      {/* Content */}
      <main className="relative flex-1 overflow-auto p-5 space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white/70 border border-border-subtle rounded-2xl overflow-hidden shadow-sm p-1">
            {INSIGHT_FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-[8px] text-[12px] font-semibold flex items-center gap-1.5 whitespace-nowrap rounded-xl transition-all ${
                  activeTab === tab.key
                    ? 'bg-teal-deep text-white shadow-sm ring-1 ring-teal-deep/30'
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
              {INSIGHT_CLIENTS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
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
          {visibleInsights.length === 0 && (
            <div className="glass-card bg-white border border-border rounded-2xl p-10 text-center shadow-sm">
              <p className="text-[14px] font-semibold text-text-muted">No insights match the current filters.</p>
            </div>
          )}

          {visibleInsights.map((ins) => {
            const isApplied = appliedIds.has(ins.id);
            return (
              <div
                key={ins.id}
                className={`glass-card bg-white border border-border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  isApplied ? 'opacity-60' : ''
                }`}
              >
                {/* Accent bar */}
                <div className="h-[3px] w-full" style={{ background: ins.accentColor }} />

                <div className="p-4 px-[18px] flex gap-3.5 items-start">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-[18px] shrink-0 ${ins.iconBg}`}
                  >
                    {ins.icon}
                  </div>

                  {/* Main */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2.5 mb-2">
                      <h3 className="text-[14px] font-bold text-text-primary leading-[1.3] flex-1">
                        {ins.title}
                      </h3>
                      <span
                      className={`shrink-0 text-[9px] font-bold tracking-[0.8px] uppercase px-2 py-[3px] rounded-[5px] ${PRIORITY_BADGE[ins.priority] ?? ''}`}
                      >
                        {ins.priority === 'opportunity' ? 'Opportunity' : ins.priority}
                      </span>
                    </div>

                    <p className="text-[12.5px] text-text-secondary leading-[1.55] mb-2.5">
                      {ins.description}
                    </p>

                    {/* Meta tags */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-[3px] rounded-[5px] bg-coral-light text-coral border border-coral-light">
                        🏪 {ins.clientName}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-[3px] rounded-[5px] bg-surface-secondary text-text-secondary border border-border">
                        {ins.platformTag}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-[3px] rounded-[5px] bg-surface-secondary text-text-secondary border border-border">
                        {ins.categoryIcon} {ins.categoryLabel}
                      </span>
                    </div>

                    {/* Impact grid */}
                    <div className="bg-surface-secondary border border-border rounded-xl px-3.5 py-2.5 flex gap-5 flex-wrap mb-3 shadow-sm">
                      {ins.impactMetrics.map((m) => (
                        <div key={m.label} className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.6px] text-text-muted">
                            {m.label}
                          </span>
                          <span className={`font-mono text-[13px] font-bold ${IMPACT_COLOR[m.color] ?? ''}`}>
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    {isApplied ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green bg-green-light rounded-md px-3 py-1.5">
                        ✓ Applied — monitoring results
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApply(ins.id)}
                          className="bg-teal-deep text-white border-none rounded-[7px] px-[18px] py-2 text-[12px] font-semibold hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md"
                        >
                          {ins.applyLabel}
                        </button>
                        <button
                          type="button"
                          className="bg-white text-text-primary border border-border rounded-[7px] px-4 py-[7px] text-[12px] font-semibold hover:border-aqua hover:text-teal-deep transition-colors shadow-sm hover:shadow-md"
                        >
                          {ins.reviewLabel}
                        </button>
                        <Link
                          href="/clients"
                          className="bg-coral-light text-coral border-2 border-coral-light rounded-[7px] px-3.5 py-[7px] text-[12px] font-semibold hover:border-coral transition-colors"
                        >
                          Open {ins.clientName.split(' ')[0]} →
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDismiss(ins.id)}
                          className="ml-auto bg-transparent border-none text-text-muted text-[12px] font-semibold px-2.5 py-[7px] rounded-[7px] hover:bg-surface-secondary hover:text-red transition-colors"
                        >
                          Dismiss ×
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Side time */}
                  <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
                    <span className="text-[11px] text-text-muted font-semibold whitespace-nowrap">
                      {ins.timeAgo}
                    </span>
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
