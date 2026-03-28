import type { Client, ClientHierarchyResponse } from '@/lib/api/contracts';

const ZERO_METRICS = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  cpc: 0,
  conversions: 0,
  cost_per_conversion: 0,
  budget: 0,
  pacing: 0,
  score: 0,
  alerts: { count: 0, severity: 'ok' as const },
};

/** When `/clients/hierarchy` is missing (old server), show clients from flat list with empty tree. */
export function buildFallbackHierarchy(clients: Client[], period: string): ClientHierarchyResponse {
  return {
    period,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      industry: c.industry ?? null,
      website: c.website ?? null,
      is_active: c.is_active !== false,
      account_mode: c.account_mode,
      platform_count: 0,
      metrics: { ...ZERO_METRICS, alerts: { ...ZERO_METRICS.alerts } },
      platforms: [],
    })),
    totals: { ...ZERO_METRICS, alerts: { ...ZERO_METRICS.alerts } },
    counts: {
      clients: clients.length,
      platforms: 0,
      campaigns: 0,
      ad_sets: 0,
    },
  };
}
