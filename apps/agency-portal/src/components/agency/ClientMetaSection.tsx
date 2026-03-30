'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaInsights } from '@/lib/api/contracts';
import { useApiAuth } from '@/hooks/useAgencyApi';

export function ClientMetaSection({ clientId }: { clientId: number }) {
  const { accessToken, agencyId } = useApiAuth();
  const [insights, setInsights] = useState<MetaInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (isRefresh = false) => {
    if (!accessToken || !agencyId || isNaN(clientId)) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await apiClient.get<MetaInsights>(
        API_ENDPOINTS.META.CLIENT_INSIGHTS(String(clientId)),
        { accessToken, agencyId },
      );
      setInsights(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Meta insights');
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

  const { connected, meta_account_status, token_valid, reason } = insights;
  const isLinked = meta_account_status === 'linked_kaivo_matched' || meta_account_status === 'linked_manual';

  // State: Agency not connected to BM
  if (!connected && reason === 'agency_not_connected') {
    return (
      <section className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-[#1877f2] flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Meta Ads
            </h2>
            <p className="text-[12px] text-text-muted font-medium mt-0.5">Agency not connected</p>
          </div>
        </div>
        <div className="p-6 text-center">
          <p className="text-[13px] text-text-secondary font-medium">
            Connect your agency's Meta Business Manager in the Integrations tab to view ad data here.
          </p>
        </div>
      </section>
    );
  }

  // State: Connecting but client not linked
  if (connected && !isLinked) {
    return (
      <section className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle bg-surface-secondary/50 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-[#1877f2] flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              Meta Ads
            </h2>
            <p className="text-[12px] text-text-muted font-medium mt-0.5">Account not linked</p>
          </div>
        </div>
        <div className="p-6 text-center">
          <p className="text-[13px] text-text-secondary font-medium">
            This client is not linked to any Meta ad account.
            Go to the Integrations tab to assign an account manually.
          </p>
        </div>
      </section>
    );
  }

  // State: Token expired
  if (connected && !token_valid) {
    return (
      <section className="bg-white rounded-xl border-2 border-red/20 overflow-hidden">
        <div className="bg-red-light/50 p-5">
          <h2 className="text-[14px] font-bold text-red flex items-center gap-2">
            ⚠ Meta Ads Sync Paused
          </h2>
          <p className="text-[13px] text-red mt-1 font-medium">
            The agency's Meta Business Manager token has expired.
            Admins must reconnect Meta in the Integrations tab to resume syncing data.
          </p>
        </div>
      </section>
    );
  }

  function formatUsd(val: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  }

  function formatNum(val: number) {
    return new Intl.NumberFormat('en-US').format(val);
  }

  // Active state
  return (
    <section className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle bg-[#e8effe]/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-bold text-[#1877f2] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Meta Ads
          </h2>
          {insights.ad_accounts?.[0] && (
            <p className="text-[12px] text-text-muted font-medium mt-0.5">
              Account: <span className="text-text-primary font-semibold">{insights.ad_accounts[0].account_name}</span>
              {' · '}BM: {insights.business_manager_name}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchInsights(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border-2 border-[#1877f2]/20 bg-white text-[#1877f2] hover:bg-[#1877f2]/10 transition-colors disabled:opacity-50"
        >
          {refreshing ? (
            <span className="w-3 h-3 border-2 border-[#1877f2]/30 border-t-[#1877f2] rounded-full animate-spin" />
          ) : (
             <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" /><path d="M13.5 2.5v4h-4" />
            </svg>
          )}
          Refresh Data
        </button>
      </div>

      <div className="p-5">
        <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3">Live Campaigns</h3>
        {insights.campaigns.length === 0 ? (
          <div className="rounded-lg bg-surface-secondary/50 border border-border p-4 text-center">
             <p className="text-[13px] text-text-muted font-medium">No campaigns found in this Meta ad account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase">Name</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase">Status</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase text-right">Spend</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase text-right">Impressions</th>
                  <th className="px-4 py-2 font-semibold text-text-muted text-[11px] uppercase text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {insights.campaigns.map((c) => (
                  <tr key={c.campaign_id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50">
                    <td className="px-4 py-2.5 font-semibold text-text-primary">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${
                        c.status === 'ACTIVE' ? 'bg-green-light text-green' : 'bg-surface-secondary text-text-muted'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-text-primary text-right">{formatUsd(c.spend)}</td>
                    <td className="px-4 py-2.5 font-mono text-text-primary text-right">{formatNum(c.impressions)}</td>
                    <td className="px-4 py-2.5 font-mono text-text-primary text-right">{formatNum(c.clicks)}</td>
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
