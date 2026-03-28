'use client';

import { useEffect, useState } from 'react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { MOCK_PLATFORMS } from '@/lib/mock/dashboard';

const MOCK_ACCOUNTS = [
  { id: 1, name: 'Harbor Coffee - Main', platform: 'Meta', status: 'active' as const, lastSynced: '2 min ago' },
  { id: 2, name: 'Nova Skincare Brand', platform: 'Meta', status: 'active' as const, lastSynced: '2 min ago' },
  { id: 3, name: 'Peaks Outdoor Search', platform: 'Google Ads', status: 'active' as const, lastSynced: '5 min ago' },
  { id: 4, name: 'Forge Supps Shopping', platform: 'Google Ads', status: 'paused' as const, lastSynced: '1 hr ago' },
  { id: 5, name: 'Harbor Coffee TikTok', platform: 'TikTok', status: 'active' as const, lastSynced: '10 min ago' },
  { id: 6, name: 'Luxe Threads Social', platform: 'TikTok', status: 'error' as const, lastSynced: '3 hrs ago' },
];

function platformStatusBadgeClass(status: (typeof MOCK_PLATFORMS)[number]['status']) {
  if (status === 'connected') return 'bg-green-light text-green';
  if (status === 'disconnected') return 'bg-amber-light text-amber';
  return 'bg-cream text-text-muted';
}

function platformStatusLabel(status: (typeof MOCK_PLATFORMS)[number]['status']) {
  if (status === 'connected') return 'Connected';
  if (status === 'disconnected') return 'Disconnected';
  return 'Not connected';
}

function accountStatusBadgeClass(status: (typeof MOCK_ACCOUNTS)[number]['status']) {
  if (status === 'active') return 'bg-green-light text-green';
  if (status === 'paused') return 'bg-amber-light text-amber';
  return 'bg-red-light text-red';
}

function accountStatusLabel(status: (typeof MOCK_ACCOUNTS)[number]['status']) {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  return 'Error';
}

function accountRowDotClass(status: (typeof MOCK_ACCOUNTS)[number]['status']) {
  if (status === 'active') return 'bg-green';
  if (status === 'paused') return 'bg-amber';
  return 'bg-red';
}

export default function IntegrationsPage() {
  const [panelPlatform, setPanelPlatform] = useState<string | null>(null);
  const [panelEntered, setPanelEntered] = useState(false);

  useEffect(() => {
    if (!panelPlatform) {
      setPanelEntered(false);
      return;
    }
    setPanelEntered(false);
    const id = window.requestAnimationFrame(() => {
      setPanelEntered(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [panelPlatform]);

  const selectedPlatform = panelPlatform
    ? MOCK_PLATFORMS.find((p) => p.id === panelPlatform) ?? null
    : null;

  const panelAccounts = selectedPlatform
    ? MOCK_ACCOUNTS.filter((a) => a.platform === selectedPlatform.name)
    : [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-cream">
      <DashboardHeader title="Integrations" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <section>
            <h2 className="text-[13px] font-bold text-text-primary mb-3">Platforms</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MOCK_PLATFORMS.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border-2 border-cream-border p-4 flex flex-col gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-[15px] font-extrabold shrink-0"
                      style={{ backgroundColor: p.iconBg, color: p.iconColor }}
                    >
                      {p.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-text-primary truncate">{p.name}</div>
                      <span
                        className={`inline-flex mt-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold ${platformStatusBadgeClass(p.status)}`}
                      >
                        {platformStatusLabel(p.status)}
                      </span>
                    </div>
                  </div>

                  <div className="text-[12px] text-text-secondary">
                    <span className="font-bold text-text-primary">{p.accounts}</span>{' '}
                    {p.accounts === 1 ? 'account' : 'accounts'}
                    <span className="text-text-muted mx-1.5">·</span>
                    <span className="font-mono font-bold text-text-primary">{p.spend}</span>
                    <span className="text-text-muted"> spend</span>
                  </div>

                  {p.status === 'connected' && p.score > 0 && (
                    <div className="text-[12px]">
                      <span className="text-text-muted font-medium">Score </span>
                      <span className="font-mono font-bold text-teal">{p.score}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-text-muted font-medium">
                    Last synced: <span className="text-text-secondary">{p.lastSynced}</span>
                  </div>

                  <div className="pt-1 mt-auto">
                    {p.status === 'connected' ? (
                      <button
                        type="button"
                        onClick={() => setPanelPlatform(p.id)}
                        className="w-full text-center text-[12px] font-bold py-2 rounded-lg bg-cream border-2 border-cream-border text-text-primary hover:bg-cream-dark transition-colors"
                      >
                        Manage
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-center text-[12px] font-bold py-2 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b-2 border-cream-border">
              <h2 className="text-[14px] font-extrabold text-text-primary">Connected accounts</h2>
              <p className="text-[12px] text-text-muted font-medium mt-0.5">
                All ad accounts linked across platforms
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-cream/80 border-b-2 border-cream-border">
                    <th className="px-5 py-3 font-bold text-text-secondary">Account name</th>
                    <th className="px-5 py-3 font-bold text-text-secondary">Platform</th>
                    <th className="px-5 py-3 font-bold text-text-secondary">Status</th>
                    <th className="px-5 py-3 font-bold text-text-secondary">Last synced</th>
                    <th className="px-5 py-3 font-bold text-text-secondary text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ACCOUNTS.map((row) => (
                    <tr key={row.id} className="border-b border-cream-border last:border-0 hover:bg-cream/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-text-primary">{row.name}</td>
                      <td className="px-5 py-3 text-text-secondary font-medium">{row.platform}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold ${accountStatusBadgeClass(row.status)}`}
                        >
                          {accountStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-text-muted font-mono text-[11px]">{row.lastSynced}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const plat = MOCK_PLATFORMS.find((x) => x.name === row.platform);
                            if (plat?.status === 'connected') setPanelPlatform(plat.id);
                          }}
                          className="text-[11px] font-bold text-teal hover:underline"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {panelPlatform && selectedPlatform && (
        <>
          <div
            role="presentation"
            className="fixed inset-0 bg-black/30 z-50 cursor-pointer"
            onClick={() => setPanelPlatform(null)}
          />
          <aside
            className={`fixed top-0 right-0 z-[60] h-full w-[400px] max-w-[100vw] bg-white shadow-xl flex flex-col border-l-2 border-cream-border transition-transform duration-300 ease-out ${
              panelEntered ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="h-[56px] px-5 flex items-center justify-between border-b-2 border-cream-border shrink-0">
              <h3 className="text-[15px] font-extrabold text-text-primary truncate pr-2">
                {selectedPlatform.name}
              </h3>
              <button
                type="button"
                onClick={() => setPanelPlatform(null)}
                className="w-9 h-9 rounded-lg border-2 border-cream-border bg-cream text-text-primary text-[18px] font-bold leading-none flex items-center justify-center hover:bg-cream-dark transition-colors shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="rounded-lg border-2 border-cream-border bg-cream/50 px-3 py-2.5">
                <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Sync status</div>
                <div className="text-[12px] font-bold text-text-primary mt-1">
                  Last synced {selectedPlatform.lastSynced}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-2">
                  Connected accounts
                </div>
                {panelAccounts.length === 0 ? (
                  <p className="text-[12px] text-text-muted font-medium">No accounts for this platform in the mock list.</p>
                ) : (
                  <ul className="space-y-3">
                    {panelAccounts.map((acc) => (
                      <li
                        key={acc.id}
                        className="rounded-xl border-2 border-cream-border bg-white p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${accountRowDotClass(acc.status)}`} />
                          <span className="text-[12px] font-bold text-text-primary truncate">{acc.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-teal-light text-teal border border-cream-border hover:bg-cream transition-colors"
                          >
                            Reconnect
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-cream border-2 border-cream-border text-text-secondary hover:bg-cream-dark transition-colors"
                          >
                            Disconnect
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="p-5 border-t-2 border-cream-border shrink-0">
              <button
                type="button"
                className="w-full text-center text-[12px] font-bold py-2.5 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
              >
                Sync all
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
