'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDashboard, useClients } from '@/hooks/useAgencyApi';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { MOCK_CLIENTS, MOCK_INSIGHTS } from '@/lib/mock/dashboard';

type TabFilter = 'all' | 'needs_action' | 'top' | 'manual_ai';

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-light text-green' : score >= 60 ? 'bg-amber-light text-amber' : 'bg-red-light text-red';
  return <span className={`inline-flex items-center px-2 py-[2px] rounded-md text-[11px] font-semibold ${color}`}>{score}</span>;
}

function PacingBar({ pacing }: { pacing: number }) {
  const color = pacing >= 90 ? 'bg-green' : pacing >= 80 ? 'bg-teal' : 'bg-coral';
  return (
    <div className="flex items-center gap-2">
      <div className="w-[60px] h-[5px] rounded-full bg-surface-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pacing}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-text-muted font-mono">{pacing}%</span>
    </div>
  );
}

function AiModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    auto: 'bg-teal-light text-teal-deep',
    hybrid: 'bg-purple-light text-purple',
    manual: 'bg-surface-secondary text-text-muted',
  };
  return <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold capitalize ${styles[mode] || styles.manual}`}>{mode}</span>;
}

function AlertBadge({ count, severity }: { count: number; severity: string }) {
  if (count === 0) return <span className="text-[11px] text-text-muted">—</span>;
  const color = severity === 'critical' ? 'bg-coral text-white' : 'bg-amber-light text-amber';
  return <span className={`min-w-[20px] h-[20px] px-1.5 rounded-md text-[10px] font-semibold flex items-center justify-center ${color}`}>{count}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-light text-red',
    warning: 'bg-amber-light text-amber',
    opportunity: 'bg-green-light text-green',
  };
  return <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold capitalize ${styles[severity] || ''}`}>{severity}</span>;
}

function PlatformTag({ name, className: cls }: { name: string; className?: string }) {
  const colors: Record<string, string> = {
    tiktok: 'bg-[#e6f9fb] text-[#00b8c4]',
    meta: 'bg-[#e8effe] text-[#1877f2]',
    google: 'bg-[#fdecea] text-[#ea4335]',
    youtube: 'bg-[#fdecea] text-[#ff0000]',
  };
  return <span className={`px-2 py-[2px] rounded-md text-[10.5px] font-semibold ${colors[cls || ''] || 'bg-surface-secondary text-text-muted'}`}>{name}</span>;
}

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboard();
  const { clients: apiClients, isLoading: clientsLoading, error: clientsError } = useClients();
  const [tab, setTab] = useState<TabFilter>('all');

  if (status === 'loading') return <DashboardSkeleton />;
  if (status !== 'authenticated') return null;

  // Prevent UI flicker: do not render mock rows while API is still loading.
  if (dashboardLoading || clientsLoading) {
    return <DashboardSkeleton />;
  }

  const clients = apiClients.length > 0
    ? apiClients.map((c: Record<string, unknown>, i: number) => ({
        ...MOCK_CLIENTS[i % MOCK_CLIENTS.length],
        id: c.id as number,
        name: (c.name as string) || MOCK_CLIENTS[i % MOCK_CLIENTS.length].name,
      }))
    : clientsError || dashboardError
      ? MOCK_CLIENTS
      : [];

  const totalSpend = clients.reduce((s: number, c: { spend: number }) => s + c.spend, 0);
  const needsAction = clients.filter((c: { alerts: { count: number } }) => c.alerts.count > 0).length;

  const filtered = tab === 'all' ? clients
    : tab === 'needs_action' ? clients.filter((c: { alerts: { count: number } }) => c.alerts.count > 0)
    : tab === 'top' ? clients.filter((c: { score: number }) => c.score >= 80)
    : clients.filter((c: { aiMode: string }) => c.aiMode === 'manual');

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'all', label: 'All Clients' },
    { key: 'needs_action', label: 'Needs Action' },
    { key: 'top', label: 'Top Performers' },
    { key: 'manual_ai', label: 'Manual AI' },
  ];

  return (
    <>
      <DashboardHeader
        title="Portfolio Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <span className="bg-surface-secondary text-text-muted text-[12px] font-medium px-3 py-[6px] rounded-lg border border-border">Last 30 days</span>
            <Link
              href="/clients"
              className="bg-teal-deep text-white text-[12px] font-semibold px-4 py-[7px] rounded-lg hover:bg-teal-deep/90 transition-colors shadow-sm"
            >
              + Add Client
            </Link>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="relative max-w-[1400px] mx-auto space-y-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-24 bg-gradient-animate opacity-25 blur-3xl rounded-[48px] -z-10"
          />
          {/* KPI Strip */}
          <div className="relative z-10 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-teal-deep to-teal rounded-xl p-5 text-white relative overflow-hidden shadow-sm transition-all hover:shadow-md">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.20),transparent_55%)] opacity-80"
              />
              <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">Portfolio Score</div>
              <div className="text-[32px] font-extrabold mt-1 font-mono tracking-tight">
                {clients.length > 0
                  ? (clients.reduce((s: number, c: { score: number }) => s + c.score, 0) / clients.length).toFixed(1)
                  : '—'}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-white/70">
                <span className="text-green-300">▲ 4.2%</span> vs last period
              </div>
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/[0.06]" />
              <div className="absolute -right-2 -bottom-6 w-20 h-20 rounded-full bg-white/[0.04]" />
            </div>
            <KpiCard label="Total Managed Spend" value={`$${(totalSpend / 1000).toFixed(1)}k`} delta="+12.4%" positive />
            <KpiCard label="AI Actions Pending" value={String(MOCK_INSIGHTS.length)} delta="3 critical" positive={false} />
            <KpiCard label="Clients Needing Action" value={String(needsAction)} delta={clients.length > 0 ? `of ${clients.length} total` : 'No clients'} positive={false} />
          </div>

          {/* Two-column: Table + Insights */}
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
                    <th className="px-3 py-3">Score</th>
                    <th className="px-3 py-3">Fee</th>
                    <th className="px-3 py-3">Spend</th>
                    <th className="px-3 py-3">Pacing</th>
                    <th className="px-3 py-3">Alerts</th>
                    <th className="px-3 py-3">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border-subtle/60 hover:bg-surface-hover/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-shadow transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <Link href={`/clients/${c.id}`} className="flex items-center gap-3">
                          <div
                            className="w-[32px] h-[32px] rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ background: c.color }}
                          >
                            {c.initials}
                          </div>
                          <div>
                            <div className="text-[12.5px] font-semibold text-text-primary">{c.name}</div>
                            <div className="text-[10.5px] text-text-muted">{c.type}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><ScoreBadge score={c.score} /></td>
                      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${c.fee.toLocaleString()}</td>
                      <td className="px-3 py-3 text-[12px] font-semibold text-text-primary font-mono">${c.spend.toLocaleString()}</td>
                      <td className="px-3 py-3"><PacingBar pacing={c.pacing} /></td>
                      <td className="px-3 py-3"><AlertBadge count={c.alerts.count} severity={c.alerts.severity} /></td>
                      <td className="px-3 py-3"><AiModeBadge mode={c.aiMode} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-[11px] text-text-muted font-medium flex items-center justify-between bg-surface-secondary/50">
                <span>{filtered.length} clients shown</span>
                <span className="font-mono">Total spend: ${totalSpend.toLocaleString()}</span>
              </div>
            </div>

            {/* AI Insights Panel */}
            <div className="glass-panel rounded-xl border border-border flex flex-col overflow-hidden shadow-sm">
              <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-flex w-2.5 h-2.5 rounded-full bg-teal-deep shadow-[0_0_24px_rgba(0,123,95,0.35)]"
                  />
                  <h3 className="text-[13px] font-bold text-text-primary">AI Insights</h3>
                </div>
                <span className="bg-coral text-white text-[10px] font-semibold px-2 py-[2px] rounded-md shadow-sm">{MOCK_INSIGHTS.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {MOCK_INSIGHTS.map((insight) => (
                  <div
                    key={insight.id}
                    className="glass-card border border-border rounded-xl p-4 space-y-2 transition-all hover:border-aqua/60 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-text-primary">{insight.client}</span>
                      <PlatformTag name={insight.platform} className={insight.platformClass} />
                      <SeverityBadge severity={insight.severity} />
                    </div>
                    <p className="text-[12px] text-text-secondary leading-relaxed">{insight.text}</p>
                    <div className="bg-teal-light rounded-lg px-3 py-[6px] text-[11px] font-semibold text-teal-deep">
                      Estimated impact: {insight.impact}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button className="bg-teal-deep text-white text-[10.5px] font-semibold px-3 py-[4px] rounded-md hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md">Apply</button>
                      <button className="bg-surface-secondary text-text-secondary text-[10.5px] font-semibold px-3 py-[4px] rounded-md hover:bg-surface-hover border border-border hover:border-aqua/40 transition-colors">Review</button>
                      <button className="text-text-muted text-[10.5px] font-medium px-2 py-[4px] hover:text-text-primary transition-colors">Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Leaderboard Row */}
          <div className="grid grid-cols-3 gap-4">
            <LeaderboardCard
              title="Top Performers"
              items={[
                { name: 'Nova Skincare', score: 91.4, color: '#007B5F' },
                { name: 'Verdant Plant Co.', score: 87.4, color: '#FF7043' },
                { name: 'Solstice Home', score: 83.1, color: '#059669' },
              ]}
            />
            <LeaderboardCard
              title="Needs Attention"
              items={[
                { name: 'Harbor Coffee Co.', score: 48.2, color: '#FF7043' },
                { name: 'Forge Supplements', score: 55.8, color: '#FFB74D' },
                { name: 'Peaks Outdoor', score: 67.2, color: '#7C3AED' },
              ]}
              negative
            />
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm transition-all hover:shadow-md hover:border-aqua/50">
              <h4 className="text-[12px] font-bold text-text-primary mb-4">Platform Performance</h4>
              <div className="space-y-3">
                {[
                  { name: 'Meta', spend: '$38.4k', score: 82.4, color: '#1877f2' },
                  { name: 'Google Ads', spend: '$22.1k', score: 78.1, color: '#ea4335' },
                  { name: 'TikTok', spend: '$14.2k', score: 64.8, color: '#00b8c4' },
                ].map(p => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-[12px] font-semibold text-text-primary flex-1">{p.name}</span>
                    <span className="text-[11px] font-medium text-text-muted font-mono">{p.spend}</span>
                    <ScoreBadge score={p.score} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function KpiCard({ label, value, delta, positive }: { label: string; value: string; delta: string; positive: boolean }) {
  return (
    <div className="group relative bg-white rounded-xl p-5 border border-border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-aqua/60">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,123,95,0.22),transparent_55%)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      />
      <div className="relative">
        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</div>
        <div className="text-[28px] font-extrabold text-text-primary mt-1 font-mono tracking-tight">{value}</div>
        <div className={`flex items-center gap-1 mt-1 text-[11px] font-medium ${positive ? 'text-green' : 'text-coral'}`}>
        {positive ? '▲' : ''} {delta}
        </div>
      </div>
    </div>
  );
}

function LeaderboardCard({ title, items, negative }: { title: string; items: { name: string; score: number; color: string }[]; negative?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 shadow-sm transition-all hover:shadow-md hover:border-aqua/50">
      <h4 className="text-[12px] font-bold text-text-primary mb-4">{title}</h4>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-text-muted w-4">{i + 1}</span>
            <div className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: item.color }}>
              {item.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <span className="text-[12px] font-semibold text-text-primary flex-1 truncate">{item.name}</span>
            <ScoreBadge score={item.score} />
          </div>
        ))}
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
