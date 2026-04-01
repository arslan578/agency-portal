const BASE = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com';

export const API_ENDPOINTS = {
  AUTH: {
    PROFILE: `${BASE}/auth/profile`,
    VERIFY_TOKEN: (token: string) => `${BASE}/auth/verify-token?token=${encodeURIComponent(token)}`,
    SET_PASSWORD: `${BASE}/auth/set-password`,
    LOGOUT: `${BASE}/auth/logout`,
  },
  ADMIN: {
    INVITE: `${BASE}/admin/invite`,
    INVITES: `${BASE}/admin/invites`,
    RESEND_INVITE: `${BASE}/admin/resend-invite`,
    AGENCIES: `${BASE}/admin/agencies`,
  },
  AGENCY: {
    GET: (id: string) => `${BASE}/agencies/${id}`,
    UPDATE: (id: string) => `${BASE}/agencies/${id}`,
    DASHBOARD: (id: string) => `${BASE}/agency/${id}/dashboard`,
    MEMBERS: (id: string) => `${BASE}/agencies/${id}/members`,
    REMOVE_MEMBER: (id: string, memberId: number) => `${BASE}/agencies/${id}/members/${memberId}`,
    INVITE: (id: string) => `${BASE}/agencies/${id}/invite`,
    INVITES: (id: string) => `${BASE}/agencies/${id}/invites`,
    CANCEL_INVITE: (id: string, inviteId: number) => `${BASE}/agencies/${id}/invites/${inviteId}`,
    CLIENTS: (id: string) => `${BASE}/agency/${id}/clients`,
    CLIENT_CREATE: (id: string) => `${BASE}/agency/${id}/clients`,
    CLIENT_UPDATE: (clientId: number) => `${BASE}/clients/${clientId}`,
    CLIENT_DELETE: (clientId: number) => `${BASE}/clients/${clientId}`,
    CLIENT_HIERARCHY: (id: string, period: string, clientId?: number, includeCampaigns: boolean = true) => {
      const q = new URLSearchParams({ period });
      if (clientId != null) q.set('client_id', String(clientId));
      if (!includeCampaigns) q.set('include_campaigns', 'false');
      return `${BASE}/agency/${id}/clients/hierarchy?${q.toString()}`;
    },
  },
  CAMPAIGN: {
    LIST: (clientId?: number) => `${BASE}/campaign/campaigns${clientId != null ? `?client_id=${clientId}` : ''}`,
    GET: (id: number) => `${BASE}/campaign/campaigns/${id}`,
    PAUSE: (id: number) => `${BASE}/campaign/campaigns/${id}/pause`,
    START: (id: number) => `${BASE}/campaign/campaigns/${id}/start`,
  },
  REPORT: {
    CAMPAIGN: (campaignId: number) => `${BASE}/reports/campaign/${campaignId}`,
  },
  CLIENT_MANAGER: {
    SUMMARY: (agencyId: string) => `${BASE}/agency/${agencyId}/client-manager`,
    UNASSIGNED: (agencyId: string) => `${BASE}/api/agency/accounts/unassigned?agency_id=${agencyId}`,
    UNASSIGNED_COUNT: (agencyId: string) => `${BASE}/api/agency/accounts/unassigned/count?agency_id=${agencyId}`,
    SUGGESTIONS: (agencyId: string) => `${BASE}/api/agency/accounts/suggestions?agency_id=${agencyId}`,
    SUGGESTION_CONFIRM: (agencyId: string, id: string) => `${BASE}/api/agency/accounts/suggestions/${id}/confirm?agency_id=${agencyId}`,
    SUGGESTION_DISMISS: (agencyId: string, id: string) => `${BASE}/api/agency/accounts/suggestions/${id}/dismiss?agency_id=${agencyId}`,
    CLIENTS: (agencyId: string) => `${BASE}/agency/${agencyId}/clients`,
    CLIENT_CREATE: (agencyId: string) => `${BASE}/api/agency/clients?agency_id=${agencyId}`,
    CLIENT_UPDATE: (agencyId: string, clientId: number) => `${BASE}/agency/${agencyId}/clients/${clientId}`,
    CLIENT_DELETE: (agencyId: string, clientId: number) => `${BASE}/agency/${agencyId}/clients/${clientId}`,
    ASSIGN: (agencyId: string, clientId: number) => `${BASE}/agency/${agencyId}/clients/${clientId}/accounts`,
    DETACH: (agencyId: string, clientId: number, accountId: number) => `${BASE}/agency/${agencyId}/clients/${clientId}/accounts/${accountId}`,
    ACCESS: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/access?agency_id=${agencyId}`,
    ACCESS_UPDATE: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/access?agency_id=${agencyId}`,
    ACCESS_LINK: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/access/link?agency_id=${agencyId}`,
    MARKUP: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/markup?agency_id=${agencyId}`,
    MARKUP_UPDATE: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/markup?agency_id=${agencyId}`,
    DISPLAY: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/display?agency_id=${agencyId}`,
    DISPLAY_UPDATE: (agencyId: string, clientId: number) => `${BASE}/api/agency/clients/${clientId}/display?agency_id=${agencyId}`,
    PORTAL_SETTINGS: (clientId: number) => `${BASE}/clients/${clientId}/portal-settings`,
  },
  INTELLIGENCE: {
    RECOMMENDATIONS: `${BASE}/intelligence/recommendations`,
  },
  META: {
    CONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/meta/connect`,
    DISCONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/meta/disconnect`,
    STATUS: (agencyId: string) => `${BASE}/agency/${agencyId}/meta/status`,
    ACCOUNTS: (agencyId: string) => `${BASE}/agency/${agencyId}/meta/accounts`,
    AUTO_LINK: (agencyId: string) => `${BASE}/agency/${agencyId}/meta/auto-link`,
    MANUAL_LINK: (clientId: string) => `${BASE}/clients/${clientId}/meta/manual-link`,
    CLIENT_INSIGHTS: (clientId: string) => `${BASE}/clients/${clientId}/meta-insights`,
  },
  REDDIT: {
    CONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/reddit/connect`,
    DISCONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/reddit/disconnect`,
    STATUS: (agencyId: string) => `${BASE}/agency/${agencyId}/reddit/status`,
    ACCOUNTS: (agencyId: string) => `${BASE}/agency/${agencyId}/reddit/accounts`,
    AUTO_LINK: (agencyId: string) => `${BASE}/agency/${agencyId}/reddit/auto-link`,
    MANUAL_LINK: (clientId: string) => `${BASE}/clients/${clientId}/reddit/manual-link`,
    CLIENT_INSIGHTS: (clientId: string) => `${BASE}/clients/${clientId}/reddit-insights`,
  },
  SPOTIFY: {
    CONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/spotify/connect`,
    DISCONNECT: (agencyId: string) => `${BASE}/agency/${agencyId}/spotify/disconnect`,
    STATUS: (agencyId: string) => `${BASE}/agency/${agencyId}/spotify/status`,
    ACCOUNTS: (agencyId: string) => `${BASE}/agency/${agencyId}/spotify/accounts`,
    AUTO_LINK: (agencyId: string) => `${BASE}/agency/${agencyId}/spotify/auto-link`,
    MANUAL_LINK: (clientId: string) => `${BASE}/clients/${clientId}/spotify/manual-link`,
    CLIENT_INSIGHTS: (clientId: string) => `${BASE}/clients/${clientId}/spotify-insights`,
  },
  INSIGHTS: {
    LIST: (status: string = 'pending', clientId?: number) => {
      const q = new URLSearchParams({ status });
      if (clientId != null) q.set('client_id', String(clientId));
      return `${BASE}/insights?${q.toString()}`;
    },
    SUMMARY: `${BASE}/insights/summary`,
    APPLY: (id: string) => `${BASE}/insights/${id}/apply`,
    DISMISS: (id: string) => `${BASE}/insights/${id}/dismiss`,
    APPLY_RECOMMENDED: `${BASE}/insights/apply_recommended`,
    SEED: `${BASE}/insights/seed_mock_data`,
  },
} as const;
