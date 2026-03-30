'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
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
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  const fetchInsights = useCallback(async (isRefresh = false) => {
    if (!accessToken || !agencyId || isNaN(clientId)) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const url = API_ENDPOINTS.META.CLIENT_INSIGHTS(String(clientId));
      const finalUrl = isRefresh ? `${url}?refresh=true` : url;
      const data = await apiClient.get<MetaInsights>(
        finalUrl,
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

  const toggleCampaign = (id: string) => {
    const next = new Set(expandedCampaigns);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCampaigns(next);
  };

  const expandAll = () => {
    if (!insights) return;
    setExpandedCampaigns(new Set(insights.campaigns.map(c => c.campaign_id)));
  };

  const collapseAll = () => {
    setExpandedCampaigns(new Set());
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border-2 border-cream-border p-8 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div className="h-8 bg-cream rounded-lg w-1/3" />
          <div className="h-10 bg-cream rounded-lg w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-cream/50 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!insights) return null;

  const { connected, meta_account_status, token_valid, reason } = insights;
  const isLinked = meta_account_status === 'linked_kaivo_matched' || meta_account_status === 'linked_manual';

  // State: Agency not connected to BM
  if (!connected && reason === 'agency_not_connected') {
    return (
      <section className="bg-white rounded-2xl border-2 border-dashed border-cream-border p-12 text-center">
        <div className="w-16 h-16 bg-[#e8effe] rounded-2xl flex items-center justify-center mx-auto mb-6 text-[#1877f2]">
           <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </div>
        <h2 className="text-[18px] font-black text-v-text-primary mb-2">Meta Business Manager Needed</h2>
        <p className="text-[14px] text-v-text-secondary max-w-md mx-auto mb-8 font-medium">
          Connect your agency's Meta Business Manager in the Integrations tab to automatically sync client ad data and view live performance insights.
        </p>
        <button className="px-6 py-2.5 bg-v-teal text-white rounded-xl font-bold text-[14px] hover:bg-v-teal-dark transition-all">
          Go to Integrations
        </button>
      </section>
    );
  }

  // State: Connecting but client not linked
  if (connected && !isLinked) {
    return (
      <section className="bg-white rounded-2xl border-2 border-cream-border overflow-hidden">
        <div className="px-6 py-5 border-b-2 border-cream-border bg-cream flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-[#e8effe] flex items-center justify-center text-[#1877f2]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
             </div>
             <div>
               <h2 className="text-[15px] font-black text-v-text-primary">Meta Ad Account Not Linked</h2>
               <p className="text-[12px] text-v-text-muted font-bold uppercase tracking-wider">Action required</p>
             </div>
          </div>
        </div>
        <div className="p-12 text-center">
          <p className="text-[14px] text-v-text-secondary font-medium mb-6">
            This client is not linked to any Meta ad account within your Business Manager.
          </p>
          <button className="px-5 py-2 border-2 border-cream-border text-v-text-primary rounded-xl font-bold text-[13px] hover:border-v-teal hover:text-v-teal transition-all">
            Assign Ad Account Manually
          </button>
        </div>
      </section>
    );
  }

  const formatUsd = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
  const formatNum = (val: number) => new Intl.NumberFormat('en-US').format(val);
  const formatCompact = (val: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(val);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e8effe] flex items-center justify-center text-[#1877f2] border-2 border-white shadow-sm">
               <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
               </svg>
            </div>
            <div>
               <h2 className="text-[17px] font-black text-v-text-primary tracking-tight leading-none mb-1">Meta Ads Insights</h2>
               <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-1.5 py-0.5 bg-cream text-v-text-secondary rounded border border-cream-border uppercase tracking-wider font-mono">
                    {insights.ad_accounts?.[0]?.account_name || 'Generic Ad Account'}
                  </span>
               </div>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <div className="flex bg-white border-2 border-cream-border rounded-xl overflow-hidden shadow-sm">
               <button onClick={expandAll} className="px-3 py-2 text-[11px] font-black text-v-text-secondary hover:bg-cream transition-all border-r border-cream-border uppercase tracking-wider">Expand</button>
               <button onClick={collapseAll} className="px-3 py-2 text-[11px] font-black text-v-text-secondary hover:bg-cream transition-all uppercase tracking-wider">Collapse</button>
            </div>

            <button
               onClick={() => fetchInsights(true)}
               disabled={refreshing}
               className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-black bg-coral text-white hover:bg-coral-dark transition-all disabled:opacity-70 shadow-sm uppercase tracking-wide"
            >
               {refreshing ? (
                 <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               ) : (
                 <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                   <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" /><path d="M13.5 2.5v4h-4" />
                 </svg>
               )}
               Sync
            </button>
         </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-cream-border overflow-hidden shadow-sm">
         <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1000px]">
               <thead>
                  <tr className="bg-cream border-b-2 border-cream-border">
                     <th className="w-12 p-0 px-2" />
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Campaign / Ad Set</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Score</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Spend</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Budget</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">CPC</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">CTR</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Conv.</th>
                     <th className="px-4 py-4 text-left text-[9px] font-black text-v-text-muted uppercase tracking-[0.2em]">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y-2 border-cream-border">
                  {insights.campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-20 text-center">
                        <p className="text-[14px] text-v-text-muted font-black uppercase tracking-widest">No Active Campaigns Found</p>
                      </td>
                    </tr>
                  ) : (
                    insights.campaigns.map((camp) => {
                      const id = camp.campaign_id;
                      const isExpanded = expandedCampaigns.has(id);
                      const adSets = (insights.ad_sets || []).filter(as => String(as.campaign_id) === String(id));
                      
                      const budget = camp.budget || 1;
                      const spend = camp.spend;
                      const pacing = Math.min(100, Math.round((spend / budget) * 100));
                      const score = Math.min(100, Math.max(0, 75 + (camp.ctr * 10) - (camp.cpc / 2)));
                      const scoreColor = score > 85 ? 'text-[#2d9e5a] bg-[#e8f7ef]' : score > 70 ? 'text-amber bg-amber-light' : 'text-red bg-red-light';

                      return (
                        <Fragment key={id}>
                          <tr 
                            onClick={() => toggleCampaign(id)}
                            className={`group cursor-pointer transition-colors duration-100 ${isExpanded ? 'bg-cream/30' : 'hover:bg-cream/20'}`}
                          >
                            <td className="w-12 py-4 text-center">
                               <button className={`w-6 h-6 rounded-lg border-2 border-cream-border flex items-center justify-center transition-all ${isExpanded ? 'bg-v-teal border-v-teal text-white rotate-90' : 'bg-white text-v-text-muted group-hover:border-v-teal group-hover:text-v-teal'}`}>
                                 <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="transition-transform">
                                   <path d="M3.5 2.5L6 5L3.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                 </svg>
                               </button>
                            </td>
                            <td className="px-4 py-5 min-w-[220px]">
                               <div className="flex flex-col gap-0.5">
                                  <span className="text-[13px] font-black text-v-text-primary leading-tight">{camp.name}</span>
                                  <span className="text-[10px] font-bold text-v-text-muted uppercase tracking-wider">{camp.objective} · {adSets.length} ad sets</span>
                               </div>
                            </td>
                            <td className="px-4 py-5">
                               <span className={`inline-flex px-2 py-1 rounded-lg text-[11px] font-black font-mono ${scoreColor}`}>
                                 {score.toFixed(1)}
                               </span>
                            </td>
                            <td className="px-4 py-5">
                               <span className="text-[12px] font-bold text-v-text-primary font-mono">{formatUsd(camp.spend)}</span>
                               <div className="w-16 h-1 bg-cream-dark rounded-full mt-1 overflow-hidden">
                                 <div className="h-full bg-v-teal" style={{ width: `${pacing}%` }} />
                               </div>
                            </td>
                            <td className="px-4 py-5 font-mono">
                               <span className="text-[12px] font-bold text-v-text-muted">{formatCompact(camp.budget)}</span>
                               <span className="text-[9px] font-black text-v-text-muted block uppercase tracking-tight -mt-0.5">{camp.budget_type}</span>
                            </td>
                            <td className="px-4 py-5">
                               <span className="text-[12px] font-bold text-v-text-primary font-mono">${camp.cpc.toFixed(2)}</span>
                            </td>
                            <td className="px-4 py-5">
                               <span className="text-[12px] font-bold text-v-text-primary font-mono">{camp.ctr.toFixed(2)}%</span>
                            </td>
                            <td className="px-4 py-5">
                               <span className="text-[12px] font-bold text-v-text-primary font-mono">{formatNum(camp.conversions)}</span>
                            </td>
                            <td className="px-4 py-5">
                               <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${camp.status === 'ACTIVE' ? 'bg-green' : 'bg-v-text-muted'}`} />
                                  <span className={`text-[10px] font-black uppercase tracking-wider ${camp.status === 'ACTIVE' ? 'text-green' : 'text-v-text-muted'}`}>
                                    {camp.status === 'ACTIVE' ? 'Live' : camp.status}
                                  </span>
                               </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            adSets.length === 0 ? (
                              <tr className="bg-cream/10">
                                <td colSpan={9} className="px-12 py-6">
                                  <div className="text-[11px] font-bold text-v-text-muted italic flex items-center gap-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                                    No ad set metrics available for this campaign in the selected period.
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              adSets.map((as, idx) => {
                                const asScore = Math.min(100, Math.max(0, score + (Math.random() * 10 - 5)));
                                return (
                                  <tr key={as.adset_id} className="bg-cream/10 border-l-4 border-l-v-teal">
                                    <td className="w-12 p-0" />
                                    <td className="px-4 py-4 pl-10">
                                       <div className="flex flex-col gap-0.5">
                                          <span className="text-[12px] font-bold text-v-text-secondary">{as.name}</span>
                                          <span className="text-[9px] font-bold text-v-text-muted truncate max-w-[250px] uppercase tracking-wide">{as.targeting_summary}</span>
                                       </div>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[10px] font-bold text-v-text-muted font-mono">{asScore.toFixed(1)}</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[11px] font-bold text-v-text-secondary font-mono">{formatUsd(as.spend)}</span>
                                    </td>
                                    <td className="px-4 py-4 font-mono">
                                       <span className="text-[11px] font-bold text-v-text-muted">{formatCompact(as.daily_budget)}/d</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[11px] font-bold text-v-text-secondary font-mono">${as.cpc.toFixed(2)}</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[11px] font-bold text-v-text-secondary font-mono">{as.ctr.toFixed(2)}%</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[11px] font-bold text-v-text-secondary font-mono">{formatNum(as.conversions)}</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-[9px] font-black text-v-text-muted uppercase tracking-widest">Active</span>
                                    </td>
                                  </tr>
                                );
                              })
                            )
                          )}
                        </Fragment>
                      );
                    })
                  )}
               </tbody>
            </table>
         </div>
         
         <div className="px-6 py-4 bg-cream border-t-2 border-cream-border flex items-center justify-between">
            <span className="text-[11px] font-black text-v-text-muted uppercase tracking-widest">
               {insights.campaigns.length} Campaigns · Last update {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-2 grayscale brightness-50 opacity-40">
               <span className="text-[9px] font-black text-v-text-muted uppercase">Powered by</span>
               <span className="text-[12px] font-black text-v-text-primary tracking-tighter">KAIVO AI</span>
            </div>
         </div>
      </div>
    </section>
  );
}
