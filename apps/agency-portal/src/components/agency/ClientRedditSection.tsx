'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { RedditInsights } from '@/lib/api/contracts';
import { useApiAuth } from '@/hooks/useAgencyApi';

export function ClientRedditSection({ clientId }: { clientId: number }) {
  const { accessToken, agencyId } = useApiAuth();
  const [insights, setInsights] = useState<RedditInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (isRefresh = false) => {
    if (!accessToken || !agencyId || isNaN(clientId)) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await apiClient.get<RedditInsights>(
        API_ENDPOINTS.REDDIT.CLIENT_INSIGHTS(String(clientId)),
        { accessToken, agencyId },
      );
      setInsights(data);
    } catch {
      toast.error('Failed to load Reddit insights');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [accessToken, agencyId, clientId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return (
      <section className="bg-white rounded-xl border border-border p-5 animate-pulse">
        <div className="h-6 bg-surface-secondary rounded w-1/4 mb-4" />
        <div className="h-20 bg-surface-secondary rounded" />
      </section>
    );
  }

  if (!insights) return null;

  if (!insights.connected && insights.reason === 'agency_not_connected') {
    return (
      <section className="bg-white rounded-xl border border-border p-6 text-center">
        <h2 className="text-[14px] font-bold text-[#ff4500]">Reddit Ads</h2>
        <p className="text-[13px] text-text-secondary font-medium mt-2">
          Connect your agency Reddit account in the Integrations tab to view client campaigns.
        </p>
      </section>
    );
  }

  if (!insights.connected && insights.reason === 'not_linked') {
    return (
      <section className="bg-white rounded-xl border border-border p-6 text-center">
        <h2 className="text-[14px] font-bold text-[#ff4500]">Reddit Ads</h2>
        <p className="text-[13px] text-text-secondary font-medium mt-2">
          This client is not linked to a Reddit ad account yet.
        </p>
      </section>
    );
  }

  if (!insights.token_valid) {
    return (
      <section className="bg-white rounded-xl border-2 border-red/20 p-6">
        <h2 className="text-[14px] font-bold text-red">Reddit sync paused</h2>
        <p className="text-[13px] text-red mt-1 font-medium">
          Agency Reddit token expired. Reconnect from Integrations.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle bg-[#fff0ec]/60 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-bold text-[#ff4500]">Reddit Ads</h2>
          {insights.ad_accounts?.[0] && (
            <p className="text-[12px] text-text-muted font-medium mt-0.5">
              Account: <span className="text-text-primary font-semibold">{insights.ad_accounts[0].account_name}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => fetchInsights(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#ff4500]/30 bg-white text-[#ff4500] hover:bg-[#fff0ec] transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Data'}
        </button>
      </div>
      <div className="p-5">
        <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3">Live Campaigns</h3>
        {insights.campaigns.length === 0 ? (
          <div className="rounded-lg bg-surface-secondary/50 border border-border p-4 text-center">
            <p className="text-[13px] text-text-muted font-medium">No campaigns found in this Reddit ad account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase">Name</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase">Status</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {insights.campaigns.map((c) => (
                  <tr key={c.campaign_id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50">
                    <td className="px-4 py-2.5 font-semibold text-text-primary">{c.name}</td>
                    <td className="px-4 py-2.5">{c.status}</td>
                    <td className="px-4 py-2.5 font-mono text-text-primary text-right">${Number(c.spend || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
