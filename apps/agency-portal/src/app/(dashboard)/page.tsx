'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { useDashboard, useClients } from '@/hooks/useAgencyApi';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { MOCK_CLIENTS, MOCK_INSIGHTS } from '@/lib/mock/dashboard';

type TabFilter = 'all' | 'needs_action' | 'top' | 'manual_ai';

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-light text-green' : score >= 60 ? 'bg-amber-light text-amber' : 'bg-red-light text-red';
  return <span className={`inline-flex items-center px-[7px] py-[2px] rounded-[6px] text-[11.5px] font-bold ${color}`}>{score}</span>;
}

function PacingBar({ pacing }: { pacing: number }) {
  const color = pacing >= 90 ? 'bg-green' : pacing >= 80 ? 'bg-teal' : 'bg-coral';
  return (
    <div className="flex items-center gap-2">
      <div className="w-[60px] h-[6px] rounded-full bg-cream-dark overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pacing}%` }} />
      </div>
      <span className="text-[11px] font-bold text-text-muted font-mono">{pacing}%</span>
    </div>
  );
}

function AiModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    auto: 'bg-teal-light text-teal',
    hybrid: 'bg-purple-light text-purple',
    manual: 'bg-cream-dark text-text-muted',
  };
  return <span className={`px-[7px] py-[2px] rounded-[6px] text-[10.5px] font-bold capitalize ${styles[mode] || styles.manual}`}>{mode}</span>;
}

function AlertBadge({ count, severity }: { count: number; severity: string }) {
  if (count === 0) return <span className="text-[11px] text-text-muted">—</span>;
  const color = severity === 'critical' ? 'bg-coral text-white' : 'bg-amber-light text-amber';
  return <span className={`min-w-[18px] h-[18px] px-1 rounded-[5px] text-[10px] font-bold flex items-center justify-center ${color}`}>{count}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-light text-red border border-red/10',
    warning: 'bg-amber-light text-amber border border-amber/10',
    opportunity: 'bg-green-light text-green border border-green/10',
  };
  return <span className={`px-2 py-[2px] rounded-[6px] text-[10.5px] font-bold capitalize ${styles[severity] || ''}`}>{severity}</span>;
}

function PlatformTag({ name, className: cls }: { name: string; className?: string }) {
  const colors: Record<string, string> = {
    tiktok: 'bg-[#e6f9fb] text-[#00b8c4]',
    meta: 'bg-[#e8effe] text-[#1877f2]',
    google: 'bg-[#fdecea] text-[#ea4335]',
    youtube: 'bg-[#fdecea] text-[#ff0000]',
  };
  return <span className={`px-2 py-[2px] rounded-[5px] text-[10.5px] font-bold ${colors[cls || ''] || 'bg-cream text-text-muted'}`}>{name}</span>;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboard();
  const { clients: apiClients, isLoading: clientsLoading, error: clientsError } = useClients();
  const [tab, setTab] = useState<TabFilter>('all');

  if (status === 'loading') return <DashboardSkeleton />;
  if (status === 'unauthenticated') redirect('/login');

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
            <span className="bg-cream text-text-muted text-[11.5px] font-bold px-3 py-[6px] rounded-lg border border-cream-border">Last 30 days</span>
            <Link
              href="/clients"
              className="bg-teal text-white text-[12px] font-bold px-4 py-[7px] rounded-lg hover:bg-teal-dark transition-colors"
            >
              + Add Client
            </Link>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-teal rounded-xl p-5 text-white relative overflow-hidden">
              <div className="text-[11px] font-bold opacity-70 uppercase tracking-wide">Portfolio Score</div>
              <div className="text-[32px] font-extrabold mt-1 font-mono">
                {clients.length > 0
                  ? (clients.reduce((s: number, c: { score: number }) => s + c.score, 0) / clients.length).toFixed(1)
                  : '—'}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-white/70">
                <span className="text-green-300">▲ 4.2%</span> vs last period
              </div>
            </div>
            <KpiCard label="Total Managed Spend" value={`$${(totalSpend / 1000).toFixed(1)}k`} delta="+12.4%" positive />
            <KpiCard label="AI Actions Pending" value={String(MOCK_INSIGHTS.length)} delta="3 critical" positive={false} />
            <KpiCard label="Clients Needing Action" value={String(needsAction)} delta={clients.length > 0 ? `of ${clients.length} total` : 'No clients'} positive={false} />
          </div>

          {/* Two-column: Table + Insights */}
          <div className="grid grid-cols-[1fr_380px] gap-5">
            {/* Client Table */}
            <div className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-cream-border">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`text-[12px] font-bold px-3 py-[5px] rounded-lg transition-colors ${
                      tab === t.key ? 'bg-teal text-white' : 'text-text-muted hover:bg-cream'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider border-b border-cream-border">
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
                    <tr key={c.id} className="border-b border-cream-border/50 hover:bg-cream/50 transition-colors cursor-pointer">
                      <td className="px-5 py-3">
                        <Link href={`/clients/${c.id}`} className="flex items-center gap-3">
                          <div
                            className="w-[32px] h-[32px] rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white shrink-0"
                            style={{ background: c.color }}
                          >
                            {c.initials}
                          </div>
                          <div>
                            <div className="text-[12.5px] font-bold text-text-primary">{c.name}</div>
                            <div className="text-[10.5px] text-text-muted">{c.type}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><ScoreBadge score={c.score} /></td>
                      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.fee.toLocaleString()}</td>
                      <td className="px-3 py-3 text-[12px] font-bold text-text-primary font-mono">${c.spend.toLocaleString()}</td>
                      <td className="px-3 py-3"><PacingBar pacing={c.pacing} /></td>
                      <td className="px-3 py-3"><AlertBadge count={c.alerts.count} severity={c.alerts.severity} /></td>
                      <td className="px-3 py-3"><AiModeBadge mode={c.aiMode} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-[11px] text-text-muted font-semibold flex items-center justify-between bg-cream/30">
                <span>{filtered.length} clients shown</span>
                <span className="font-mono">Total spend: ${totalSpend.toLocaleString()}</span>
              </div>
            </div>

            {/* AI Insights Panel */}
            <div className="bg-white rounded-xl border-2 border-cream-border flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-cream-border flex items-center justify-between">
                <h3 className="text-[13px] font-extrabold text-text-primary">AI Insights</h3>
                <span className="bg-coral text-white text-[10px] font-bold px-2 py-[2px] rounded-[5px]">{MOCK_INSIGHTS.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {MOCK_INSIGHTS.map((insight) => (
                  <div key={insight.id} className="border-2 border-cream-border rounded-xl p-4 space-y-2 hover:border-teal/30 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-text-primary">{insight.client}</span>
                      <PlatformTag name={insight.platform} className={insight.platformClass} />
                      <SeverityBadge severity={insight.severity} />
                    </div>
                    <p className="text-[12px] text-text-secondary leading-relaxed">{insight.text}</p>
                    <div className="bg-teal-light rounded-lg px-3 py-[6px] text-[11px] font-bold text-teal">
                      Estimated impact: {insight.impact}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button className="bg-teal text-white text-[10.5px] font-bold px-3 py-[4px] rounded-[6px] hover:bg-teal-dark">Apply</button>
                      <button className="bg-cream text-text-secondary text-[10.5px] font-bold px-3 py-[4px] rounded-[6px] hover:bg-cream-dark border border-cream-border">Review</button>
                      <button className="text-text-muted text-[10.5px] font-bold px-2 py-[4px] hover:text-text-primary">Dismiss</button>
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
                { name: 'Nova Skincare', score: 91.4, color: '#2a9d8f' },
                { name: 'Verdant Plant Co.', score: 87.4, color: '#c85a3d' },
                { name: 'Solstice Home', score: 83.1, color: '#2d9e5a' },
              ]}
            />
            <LeaderboardCard
              title="Needs Attention"
              items={[
                { name: 'Harbor Coffee Co.', score: 48.2, color: '#e76f51' },
                { name: 'Forge Supplements', score: 55.8, color: '#d4860a' },
                { name: 'Peaks Outdoor', score: 67.2, color: '#5c54c8' },
              ]}
              negative
            />
            <div className="bg-white rounded-xl border-2 border-cream-border p-5">
              <h4 className="text-[12px] font-extrabold text-text-primary mb-4">Platform Performance</h4>
              <div className="space-y-3">
                {[
                  { name: 'Meta', spend: '$38.4k', score: 82.4, color: '#1877f2' },
                  { name: 'Google Ads', spend: '$22.1k', score: 78.1, color: '#ea4335' },
                  { name: 'TikTok', spend: '$14.2k', score: 64.8, color: '#00b8c4' },
                ].map(p => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-[12px] font-bold text-text-primary flex-1">{p.name}</span>
                    <span className="text-[11px] font-bold text-text-muted font-mono">{p.spend}</span>
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
    <div className="bg-white rounded-xl p-5 border-2 border-cream-border">
      <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-[28px] font-extrabold text-text-primary mt-1 font-mono">{value}</div>
      <div className={`flex items-center gap-1 mt-1 text-[11px] font-bold ${positive ? 'text-green' : 'text-coral'}`}>
        {positive ? '▲' : ''} {delta}
      </div>
    </div>
  );
}

function LeaderboardCard({ title, items, negative }: { title: string; items: { name: string; score: number; color: string }[]; negative?: boolean }) {
  return (
    <div className="bg-white rounded-xl border-2 border-cream-border p-5">
      <h4 className="text-[12px] font-extrabold text-text-primary mb-4">{title}</h4>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-text-muted w-4">{i + 1}</span>
            <div className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[9px] font-extrabold text-white shrink-0" style={{ background: item.color }}>
              {item.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <span className="text-[12px] font-bold text-text-primary flex-1 truncate">{item.name}</span>
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
              <div key={i} className="bg-white rounded-xl p-5 border-2 border-cream-border animate-pulse">
                <div className="h-3 w-24 bg-cream-dark rounded mb-3" />
                <div className="h-8 w-16 bg-cream-dark rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
