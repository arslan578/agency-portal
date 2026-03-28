'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import {
  DashboardSchema, ClientSchema, TeamMemberSchema, InviteSchema,
  CampaignSchema, ReportRecordSchema,
  validateResponse, validateArray,
  type DashboardData, type Client, type TeamMember, type Invite,
  type Campaign, type ReportRecord,
} from '@/lib/api/contracts';

function useAuthHeaders() {
  const { data: session } = useSession();
  const accessToken = session?.accessToken || session?.user?.accessToken;
  const agencyId = session?.user?.agencyId;
  return { accessToken, agencyId };
}

function makeSwrFetcher<T>(
  urlFn: (agencyId: string) => string,
  validate: (data: unknown) => { ok: true; data: T } | { ok: false; error: string },
) {
  return async ([, accessToken, agencyId]: [string, string, string]) => {
    const raw = await apiClient.get<unknown>(urlFn(agencyId), { accessToken, agencyId });
    const v = validate(raw);
    if (!v.ok) {
      console.warn(v.error);
      return raw as T;
    }
    return v.data;
  };
}

export function useDashboard() {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId ? ['dashboard', accessToken, agencyId] : null;

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    key,
    makeSwrFetcher<DashboardData>(
      (id) => API_ENDPOINTS.AGENCY.DASHBOARD(id),
      (d) => validateResponse(DashboardSchema, d),
    ),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  return { data, error, isLoading, refresh: mutate };
}

export function useClients() {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId ? ['clients', accessToken, agencyId] : null;

  const { data, error, isLoading, mutate } = useSWR<Client[]>(
    key,
    makeSwrFetcher<Client[]>(
      (id) => API_ENDPOINTS.AGENCY.CLIENTS(id),
      (d) => validateArray(ClientSchema, d),
    ),
    { revalidateOnFocus: false },
  );

  return { clients: data ?? [], error, isLoading, refresh: mutate };
}

export function useMembers() {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId ? ['members', accessToken, agencyId] : null;

  const { data, error, isLoading, mutate } = useSWR<TeamMember[]>(
    key,
    makeSwrFetcher<TeamMember[]>(
      (id) => API_ENDPOINTS.AGENCY.MEMBERS(id),
      (d) => validateArray(TeamMemberSchema, d),
    ),
    { revalidateOnFocus: false },
  );

  return { members: data ?? [], error, isLoading, refresh: mutate };
}

export function useInvites() {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId ? ['invites', accessToken, agencyId] : null;

  const { data, error, isLoading, mutate } = useSWR<Invite[]>(
    key,
    makeSwrFetcher<Invite[]>(
      (id) => API_ENDPOINTS.AGENCY.INVITES(id),
      (d) => validateArray(InviteSchema, d),
    ),
    { revalidateOnFocus: false },
  );

  return { invites: data ?? [], error, isLoading, refresh: mutate };
}

export function useCampaigns(clientId?: number) {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId
    ? ['campaigns', accessToken, agencyId, String(clientId ?? '')]
    : null;

  const { data, error, isLoading, mutate } = useSWR<Campaign[]>(
    key,
    async ([, token, agency]: [string, string, string]) => {
      const url = API_ENDPOINTS.CAMPAIGN.LIST(clientId);
      const raw = await apiClient.get<unknown>(url, { accessToken: token, agencyId: agency });
      const v = validateArray(CampaignSchema, raw);
      if (!v.ok) { console.warn(v.error); return (Array.isArray(raw) ? raw : []) as Campaign[]; }
      return v.data;
    },
    { revalidateOnFocus: false },
  );

  return { campaigns: data ?? [], error, isLoading, refresh: mutate };
}

export function useCampaignReports(campaignId: number | null) {
  const { accessToken, agencyId } = useAuthHeaders();
  const key = accessToken && agencyId && campaignId
    ? ['campaign-report', accessToken, agencyId, String(campaignId)]
    : null;

  const { data, error, isLoading } = useSWR<ReportRecord[]>(
    key,
    async ([, token, agency]: [string, string, string]) => {
      const url = API_ENDPOINTS.REPORT.CAMPAIGN(campaignId!);
      const raw = await apiClient.get<unknown>(url, { accessToken: token, agencyId: agency });
      const v = validateArray(ReportRecordSchema, raw);
      if (!v.ok) { console.warn(v.error); return (Array.isArray(raw) ? raw : []) as ReportRecord[]; }
      return v.data;
    },
    { revalidateOnFocus: false },
  );

  return { reports: data ?? [], error, isLoading };
}

export function useApiAuth() {
  return useAuthHeaders();
}
