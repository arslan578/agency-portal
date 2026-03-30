'use client';

import { useMemo, useState } from 'react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { useClients } from '@/hooks/useAgencyApi';
import { MOCK_CLIENTS } from '@/lib/mock/dashboard';

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const MONTHS = ['Jan 2026', 'Feb 2026', 'Mar 2026'] as const;

export default function BillingPage() {
  const [month, setMonth] = useState<(typeof MONTHS)[number]>('Mar 2026');
  const { clients } = useClients();

  const rows = useMemo(() => {
    const source = clients.length
      ? clients.map((c, idx) => ({
          id: c.id,
          name: c.name,
          initials: c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
          type: c.industry || 'Client',
          spend: 3000 + ((idx * 1700) % 12000),
          pacing: 55 + ((idx * 11) % 40),
          status: idx % 5 === 0 ? 'paused' : 'active',
        }))
      : MOCK_CLIENTS.map((c) => ({
          id: c.id,
          name: c.name,
          initials: c.initials,
          type: c.type,
          spend: c.spend,
          pacing: c.pacing,
          status: c.pacing < 70 ? 'paused' : 'active',
        }));

    return source.slice(0, 12).map((r) => ({
      ...r,
      fee: Math.round(r.spend * 0.02),
      activeDays: r.status === 'paused' ? '8 / 31' : '31 / 31',
    }));
  }, [clients]);

  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
  const spendFee = rows.reduce((sum, r) => sum + r.fee, 0);
  const planFee = 499;
  const totalDue = planFee + spendFee;

  return (
    <div className="flex flex-col h-full bg-surface-secondary overflow-hidden">
      <DashboardHeader
        title="Billing & Spend"
        actions={
          <>
            <button className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[12px] font-semibold border border-border bg-white text-text-primary hover:border-aqua hover:text-teal-deep transition-colors">
              Download Invoice
            </button>
            <button className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[12px] font-semibold border-2 border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 hover:border-teal-deep transition-colors">
              Payment Settings
            </button>
          </>
        }
      />

      <main className="flex-1 overflow-auto p-6 space-y-5">
        <section className="bg-white border border-border rounded-xl px-5 py-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-muted mr-1">Period:</span>
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              className={`px-3.5 py-1.5 text-[12px] font-semibold border rounded-lg transition-colors ${
                month === m
                  ? 'bg-teal-deep border-teal-deep text-white'
                  : 'bg-white border-border text-text-muted hover:border-aqua hover:text-teal-deep'
              }`}
            >
              {m}
            </button>
          ))}
          <span className="text-[11px] text-text-muted font-semibold ml-2">
            · Billing closes 31 Mar · Invoice sent 1 Apr
          </span>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <article className="xl:col-span-2 bg-teal-deep rounded-xl p-6 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.8px] opacity-80">Total Due — {month}</p>
            <p className="mt-2 font-mono text-[36px] font-bold leading-none">{formatUsd(totalDue)}</p>
            <p className="text-[12px] opacity-80 mt-2">Due 1 April 2026 · Invoice #KAI-2026-03</p>
            <div className="mt-4 space-y-1 text-[12px]">
              <div className="flex justify-between"><span>Agency Growth plan</span><span className="font-mono">{formatUsd(planFee)}</span></div>
              <div className="flex justify-between"><span>Spend fee (2% of spend)</span><span className="font-mono">{formatUsd(spendFee)}</span></div>
              <div className="h-px bg-white/20 my-1" />
              <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatUsd(totalDue)}</span></div>
            </div>
          </article>

          <article className="bg-white border border-border rounded-xl p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.8px] text-text-muted">Total Managed Spend</p>
            <p className="mt-2 font-mono text-[24px] font-bold leading-none text-text-primary">{formatUsd(totalSpend)}</p>
            <p className="text-[11px] text-text-muted mt-2">Across {rows.length} clients · MTD</p>
          </article>

          <article className="bg-white border border-border rounded-xl p-5">
            <div className="h-[3px] -mt-5 -mx-5 mb-4 bg-purple" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.8px] text-text-muted">Your Plan</p>
            <p className="mt-2 font-mono text-[24px] font-bold leading-none text-text-primary">{formatUsd(planFee)}</p>
            <p className="text-[11px] text-text-muted mt-2">Agency Growth · billed separately</p>
            <p className="text-[10px] text-text-muted mt-3 pt-2 border-t border-border">
              Up to 20 clients · All platforms · White-label included
            </p>
          </article>

          <article className="bg-white border border-border rounded-xl p-5">
            <div className="h-[3px] -mt-5 -mx-5 mb-4 bg-teal-deep" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.8px] text-text-muted">Spend Fee Rate</p>
            <p className="mt-2 font-mono text-[24px] font-bold leading-none text-text-primary">2%</p>
            <p className="text-[11px] text-text-muted mt-2">Calculated daily · Invoiced monthly</p>
          </article>
        </section>

        <section className="bg-white border border-border rounded-xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-bold text-text-primary">Your Plan</h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Renews 1 April 2026 · <span className="text-teal-deep font-semibold">Manage payment method →</span>
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 xl:grid-cols-3">
            <article className="p-6 border-b xl:border-b-0 xl:border-r border-border opacity-70">
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-text-muted">Agency Starter</p>
              <p className="mt-2 font-mono text-[26px] font-bold text-text-primary">$199<span className="text-[12px] text-text-muted font-normal">/mo</span></p>
              <p className="text-[11px] text-teal-deep font-semibold mt-1">+ 2% of total client spend</p>
              <ul className="mt-4 text-[11.5px] text-text-secondary space-y-1.5">
                <li>✓ Multi-client dashboard</li>
                <li>✓ Client workspace separation</li>
                <li>✓ Basic white-label reports</li>
                <li className="text-text-muted">✗ Client portal access</li>
              </ul>
              <button className="mt-4 w-full px-3 py-2 border border-border rounded-lg text-[12px] font-semibold text-text-muted">
                Downgrade
              </button>
            </article>

            <article className="p-6 border-b xl:border-b-0 xl:border-r border-border bg-teal-light relative">
              <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-[0.6px] bg-teal-deep text-white px-2 py-1 rounded">
                Current Plan
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-teal-dark">Agency Growth</p>
              <p className="mt-2 font-mono text-[26px] font-bold text-teal-dark">$499<span className="text-[12px] font-normal">/mo</span></p>
              <p className="text-[11px] text-teal-dark font-semibold mt-1">+ 2% of total client spend</p>
              <ul className="mt-4 text-[11.5px] text-teal-dark space-y-1.5">
                <li>✓ Full white-label branding</li>
                <li>✓ Custom domain for reports</li>
                <li>✓ Automated client reporting</li>
                <li>✓ Priority support</li>
              </ul>
              <button className="mt-4 w-full px-3 py-2 border-2 border-teal-deep rounded-lg text-[12px] font-semibold text-white bg-teal-deep">
                Current Plan
              </button>
            </article>

            <article className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-text-muted">Agency Scale</p>
              <p className="mt-2 font-mono text-[26px] font-bold text-text-primary">$999<span className="text-[12px] text-text-muted font-normal">/mo</span></p>
              <p className="text-[11px] text-teal-deep font-semibold mt-1">+ 1.75% of total client spend</p>
              <ul className="mt-4 text-[11.5px] text-text-secondary space-y-1.5">
                <li>✓ Unlimited team members</li>
                <li>✓ Dedicated success manager</li>
                <li>✓ Custom integrations</li>
                <li>✓ 24/7 priority support</li>
              </ul>
              <button className="mt-4 w-full px-3 py-2 border-2 border-teal-deep rounded-lg text-[12px] font-semibold text-teal-deep bg-white">
                Upgrade
              </button>
            </article>
          </div>
          <div className="px-5 py-3 bg-surface-secondary border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-text-muted font-semibold">
              Billed monthly · Cancel anytime · Spend fee calculated on actual ad spend deployed
            </span>
            <span className="text-[12px] font-semibold text-teal-deep">Talk to us about custom pricing →</span>
          </div>
        </section>

        <section className="bg-white border border-border rounded-xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-text-primary">Per-Client Breakdown — {month}</h2>
            <button className="text-[12px] font-semibold text-teal-deep hover:text-teal-deep/90">Export CSV →</button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted">Client</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted">Status</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted">Active Days</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted">Spend MTD</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted">Spend Progress</th>
                  <th className="px-5 py-3 text-[11px] uppercase tracking-wide font-semibold text-text-muted text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-[30px] h-[30px] rounded-[7px] bg-coral text-white text-[10px] font-semibold flex items-center justify-center">
                          {row.initials}
                        </div>
                        <div>
                          <div className="text-[12.5px] font-semibold text-text-primary">{row.name}</div>
                          <div className="text-[10px] text-text-muted">{row.type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10.5px] font-semibold ${
                        row.status === 'active' ? 'bg-green-light text-green' : 'bg-amber-light text-amber'
                      }`}>
                        {row.status === 'active' ? '● Active' : '⏸ Paused'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-text-primary">{row.activeDays}</td>
                    <td className="px-5 py-3 font-mono text-text-primary">{formatUsd(row.spend)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-[70px] h-1 rounded bg-surface-secondary overflow-hidden">
                          <div
                            className={`h-full rounded ${row.pacing >= 80 ? 'bg-teal-deep' : 'bg-amber'}`}
                            style={{ width: `${Math.min(row.pacing, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted font-semibold">{row.pacing}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-text-primary text-right">{formatUsd(row.fee)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-secondary border-t border-border">
                  <td colSpan={3} className="px-5 py-3 font-semibold text-text-primary">
                    Total — {month}
                  </td>
                  <td className="px-5 py-3 font-mono font-semibold text-text-primary">{formatUsd(totalSpend)}</td>
                  <td />
                  <td className="px-5 py-3 font-mono font-semibold text-teal-deep text-right">{formatUsd(spendFee)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-border rounded-xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-text-primary">Invoice History</h2>
            <button className="text-[12px] font-semibold text-teal-deep hover:text-teal-deep/90">Download All →</button>
          </header>
          <div>
            {[
              { month: 'February 2026', clients: '12 clients · 28 days · Invoice #KAI-2026-02', spend: '$82,400 spend', fee: '$2,147', status: 'Paid' },
              { month: 'January 2026', clients: '10 clients · 31 days · Invoice #KAI-2026-01', spend: '$71,200 spend', fee: '$1,923', status: 'Paid' },
              { month: 'December 2025', clients: '8 clients · 31 days · Invoice #KAI-2025-12', spend: '$58,900 spend', fee: '$1,677', status: 'Paid' },
            ].map((inv) => (
              <div key={inv.month} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-b-0">
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">{inv.month}</p>
                  <p className="text-[11px] text-text-muted font-semibold">{inv.clients}</p>
                </div>
                <p className="ml-auto text-[12px] font-mono font-semibold text-text-secondary">{inv.spend}</p>
                <p className="text-[13px] font-mono font-bold text-teal-deep min-w-[80px] text-right">{inv.fee}</p>
                <span className="text-[10.5px] font-semibold px-2 py-1 rounded bg-green-light text-green">✓ {inv.status}</span>
                <button className="text-[11px] font-semibold text-teal-deep border border-border rounded px-2.5 py-1 hover:border-aqua">PDF</button>
                <button className="text-[11px] font-semibold text-teal-deep border border-border rounded px-2.5 py-1 hover:border-aqua">CSV</button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

