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
    CLIENT_HIERARCHY: (id: string, period: string, clientId?: number) => {
      const q = new URLSearchParams({ period });
      if (clientId != null) q.set('client_id', String(clientId));
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
  INTELLIGENCE: {
    RECOMMENDATIONS: `${BASE}/intelligence/recommendations`,
  },
} as const;
