'use client';

import { useMemo, useState } from 'react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { ApiErrorBanner } from '@/components/ui/ApiErrorBanner';
import { useCampaignReports, useCampaigns, useClients } from '@/hooks/useAgencyApi';

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '0.00%';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

export default function ReportsPage() {
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { clients, isLoading: clientsLoading, error: clientsError } = useClients();
  const { campaigns, isLoading: campaignsLoading, error: campaignsError } = useCampaigns(
    clientFilter === 'all' ? undefined : Number(clientFilter),
  );

  const filteredCampaigns = useMemo(() => {
    if (statusFilter === 'all') return campaigns;
    return campaigns.filter((c) => c.status.toLowerCase() === statusFilter);
  }, [campaigns, statusFilter]);

  const selectedCampaignId = filteredCampaigns[0]?.id ?? null;
  const {
    reports,
    isLoading: reportsLoading,
    error: reportsError,
  } = useCampaignReports(selectedCampaignId);

  const aggregated = useMemo(() => {
    return reports.reduce(
      (acc, row) => {
        acc.impressions += row.impressions || 0;
        acc.clicks += row.clicks || 0;
        acc.spend += row.spend || 0;
        acc.conversions += row.conversions || 0;
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    );
  }, [reports]);

  const cpc = aggregated.clicks ? aggregated.spend / aggregated.clicks : 0;
  const cpa = aggregated.conversions ? aggregated.spend / aggregated.conversions : 0;
  const ctr = pct(aggregated.clicks, aggregated.impressions);

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      <DashboardHeader title="Reporting" subtitle="Campaign performance and analytics" />

      <main className="flex-1 overflow-auto p-6 space-y-5">
        {(clientsError || campaignsError || reportsError) && (
          <ApiErrorBanner
            error={clientsError || campaignsError || reportsError}
            title="Unable to load reporting data"
          />
        )}

        <section className="bg-white rounded-xl border-2 border-cream-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-[40px] px-3 border-2 border-cream-border rounded-[10px] bg-cream text-[13px] text-text-primary"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="h-[40px] px-3 border-2 border-cream-border rounded-[10px] bg-cream text-[13px] text-text-primary"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
            </select>
            <span className="ml-auto text-[12px] font-semibold text-text-muted">
              Campaigns: <strong className="text-text-primary">{filteredCampaigns.length}</strong>
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {[
            { label: 'Impressions', value: aggregated.impressions.toLocaleString() },
            { label: 'Clicks', value: aggregated.clicks.toLocaleString() },
            { label: 'CTR', value: ctr },
            { label: 'Spend', value: formatUsd(aggregated.spend) },
            { label: 'CPC', value: cpc ? formatUsd(cpc) : '—' },
            { label: 'CPA', value: cpa ? formatUsd(cpa) : '—' },
          ].map((item) => (
            <article
              key={item.label}
              className="bg-white rounded-xl border-2 border-cream-border p-4"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{item.label}</p>
              <p className="mt-2 text-[24px] leading-none font-extrabold font-mono text-text-primary">
                {clientsLoading || campaignsLoading || reportsLoading ? '...' : item.value}
              </p>
            </article>
          ))}
        </section>

        <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
          <header className="px-5 py-4 border-b-2 border-cream-border bg-cream-dark/30">
            <h2 className="text-[14px] font-extrabold text-text-primary">Campaign Status Overview</h2>
            <p className="text-[12px] text-text-muted mt-0.5">Live campaign inventory with status indicators.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b-2 border-cream-border bg-cream/80">
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Campaign</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Status</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Budget</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Platform</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-text-muted font-medium">
                      No campaigns found.
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-cream-border last:border-b-0 hover:bg-cream-dark/20">
                      <td className="px-5 py-3 font-semibold text-text-primary">{c.name || `Campaign #${c.id}`}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold capitalize ${
                          c.status === 'active' || c.status === 'running'
                            ? 'bg-green-light text-green'
                            : c.status === 'paused'
                              ? 'bg-amber-light text-amber'
                              : 'bg-cream-dark text-text-muted'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-text-primary">
                        {formatUsd((c.total_budget_cents || 0) / 100)}
                      </td>
                      <td className="px-5 py-3 text-text-secondary">
                        {Object.keys(c.platform_allocations || {}).join(', ') || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden">
          <header className="px-5 py-4 border-b-2 border-cream-border bg-cream-dark/30">
            <h2 className="text-[14px] font-extrabold text-text-primary">Selected Campaign Report</h2>
            <p className="text-[12px] text-text-muted mt-0.5">
              Showing rows from `GET /reports/campaign/{'{campaign_id}'}` for campaign {selectedCampaignId ?? '—'}.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b-2 border-cream-border bg-cream/80">
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Date</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Platform</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Impressions</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Clicks</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Spend</th>
                  <th className="px-5 py-3 font-bold text-text-muted uppercase text-[11px] tracking-wide">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-text-muted font-medium">
                      No report records available.
                    </td>
                  </tr>
                ) : (
                  reports.map((row, idx) => (
                    <tr key={`${row.date}-${row.platform}-${idx}`} className="border-b border-cream-border last:border-b-0 hover:bg-cream-dark/20">
                      <td className="px-5 py-3 text-text-primary">{row.date}</td>
                      <td className="px-5 py-3 text-text-secondary">{row.platform}</td>
                      <td className="px-5 py-3 font-mono text-text-primary">{row.impressions.toLocaleString()}</td>
                      <td className="px-5 py-3 font-mono text-text-primary">{row.clicks.toLocaleString()}</td>
                      <td className="px-5 py-3 font-mono text-text-primary">{formatUsd(row.spend)}</td>
                      <td className="px-5 py-3 font-mono text-text-primary">{row.conversions.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
