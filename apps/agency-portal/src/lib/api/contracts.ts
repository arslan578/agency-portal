import { z } from 'zod';

export const AgencySchema = z.object({
  id: z.number(),
  name: z.string(),
  current_plan: z.string().optional().default('free'),
  credits: z.number().optional().default(0),
  billing_status: z.string().optional().default('active'),
  stripe_customer_id: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const ClientSchema = z.object({
  id: z.number(),
  agency_id: z.number(),
  name: z.string(),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  account_mode: z.string().optional(),
  markup_percent: z.union([z.string(), z.number()]).optional(),
});

export const TeamMemberSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  email: z.string(),
  full_name: z.string().nullable().optional(),
  role: z.string(),
  created_at: z.string().optional(),
});

export const InviteSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: z.string(),
  expires_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const DashboardSchema = z.object({
  agency: AgencySchema,
  clients_count: z.number().default(0),
  campaigns_count: z.number().default(0),
  active_campaigns_count: z.number().default(0),
});

export type Agency = z.infer<typeof AgencySchema>;
export type Client = z.infer<typeof ClientSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type DashboardData = z.infer<typeof DashboardSchema>;

export function validateResponse<T>(schema: z.ZodType<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const msg = result.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, error: `Contract violation: ${msg}` };
}

export function validateArray<T>(schema: z.ZodType<T>, data: unknown): { ok: true; data: T[] } | { ok: false; error: string } {
  if (!Array.isArray(data)) return { ok: false, error: 'Expected array from API' };
  const result = z.array(schema).safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const msg = result.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, error: `Contract violation: ${msg}` };
}

export const CampaignSchema = z.object({
  id: z.number(),
  plan_id: z.number().nullable().optional(),
  status: z.string(),
  client_id: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  total_budget_cents: z.number().default(0),
  goal: z.string().nullable().optional(),
  platform_allocations: z.record(z.string(), z.number()).nullable().optional(),
  platform_campaign_ids: z.record(z.string(), z.string()).nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export const ReportRecordSchema = z.object({
  date: z.string(),
  platform: z.string(),
  impressions: z.number().default(0),
  clicks: z.number().default(0),
  spend: z.number().default(0),
  conversions: z.number().default(0),
});

export type Campaign = z.infer<typeof CampaignSchema>;
export type ReportRecord = z.infer<typeof ReportRecordSchema>;

export const HierarchyAlertsSchema = z.object({
  count: z.number(),
  severity: z.string(),
});

export const HierarchyMetricsSchema = z.object({
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
  conversions: z.number(),
  cost_per_conversion: z.number(),
  budget: z.number(),
  pacing: z.number(),
  score: z.number(),
  alerts: HierarchyAlertsSchema,
});

export const HierarchyAdSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  metrics: HierarchyMetricsSchema,
});

export const HierarchyCampaignSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  metrics: HierarchyMetricsSchema,
  ad_sets: z.array(HierarchyAdSetSchema).default([]),
});

export const HierarchyLinkedAccountSchema = z.object({
  id: z.number(),
  external_id: z.string(),
});

export const HierarchyPlatformSchema = z.object({
  key: z.string(),
  display_name: z.string(),
  account_ids: z.array(z.string()).default([]),
  linked_accounts: z.array(HierarchyLinkedAccountSchema).default([]),
  metrics: HierarchyMetricsSchema,
  campaigns: z.array(HierarchyCampaignSchema).default([]),
});

export const HierarchyClientSchema = z.object({
  id: z.number(),
  name: z.string(),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  account_mode: z.string().optional(),
  platform_count: z.number().default(0),
  metrics: HierarchyMetricsSchema,
  platforms: z.array(HierarchyPlatformSchema).default([]),
});

export const HierarchyCountsSchema = z.object({
  clients: z.number(),
  platforms: z.number(),
  campaigns: z.number(),
  ad_sets: z.number(),
});

export const ClientHierarchyResponseSchema = z.object({
  period: z.string(),
  clients: z.array(HierarchyClientSchema),
  totals: HierarchyMetricsSchema,
  counts: HierarchyCountsSchema,
});

export type ClientHierarchyResponse = z.infer<typeof ClientHierarchyResponseSchema>;
export type HierarchyClientRow = z.infer<typeof HierarchyClientSchema>;
export type HierarchyPlatformRow = z.infer<typeof HierarchyPlatformSchema>;
export type HierarchyCampaignRow = z.infer<typeof HierarchyCampaignSchema>;

export const AGENCY_ROLES = {
  agency_admin:   { label: 'Admin',   description: 'Full access to all agency features, billing, and team management' },
  agency_manager: { label: 'Manager', description: 'Can manage clients, campaigns, and view reports' },
  agency_viewer:  { label: 'Viewer',  description: 'Read-only access to dashboards and reports' },
} as const;

export type AgencyRole = keyof typeof AGENCY_ROLES;

export const ROLE_PERMISSIONS: Record<AgencyRole, { capabilities: string[]; sections: string[] }> = {
  agency_admin: {
    capabilities: [
      'View agency dashboard',
      'Manage clients (create, edit, delete)',
      'Manage team members (invite, remove)',
      'Change agency settings',
      'Access billing and plan management',
      'Create and manage campaigns',
      'View all reports and analytics',
    ],
    sections: ['Dashboard', 'Clients', 'Team', 'Settings', 'Billing', 'Campaigns', 'Reports'],
  },
  agency_manager: {
    capabilities: [
      'View agency dashboard',
      'Manage clients (create, edit)',
      'Create and manage campaigns',
      'View all reports and analytics',
    ],
    sections: ['Dashboard', 'Clients', 'Campaigns', 'Reports'],
  },
  agency_viewer: {
    capabilities: [
      'View agency dashboard',
      'View client list',
      'View reports and analytics',
    ],
    sections: ['Dashboard', 'Clients (read-only)', 'Reports'],
  },
};

// ── Meta Business Manager Types ─────────────────────────────────────────────

export interface MetaAdAccount {
  account_id: string;
  account_name: string;
  currency: string;
  timezone: string;
  status: string;
  spend?: number;
}

export interface MetaCampaign {
  campaign_id: string;
  name: string;
  objective: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string;
  budget_type: 'daily' | 'lifetime';
  budget: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  ad_account_id: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_conversion: number;
}

export interface MetaAdSet {
  adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  daily_budget: number;
  targeting_summary: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cost_per_conversion: number;
}

export interface MetaInsights {
  connected: boolean;
  reason?: 'agency_not_connected' | 'not_linked' | 'token_expired';
  meta_account_status: string;
  business_manager_name?: string;
  ad_accounts: MetaAdAccount[];
  campaigns: MetaCampaign[];
  ad_sets: MetaAdSet[];
  token_valid: boolean;
  token_expires_at: string | null;
}

export interface BMAccount {
  account_id: string;
  account_name: string;
  currency: string;
  timezone: string;
  status: string;
  spend: number;
  linked_client_id?: string | null;
}

export interface MetaBMStatus {
  connected: boolean;
  business_manager_id: string | null;
  business_manager_name: string | null;
  connected_at: string | null;
  token_valid: boolean;
  token_expires_at: string | null;
  token_warning: boolean;
}

export interface RedditAdAccount {
  account_id: string;
  account_name: string;
  currency: string;
  status: string;
  spend?: number;
}

export interface RedditCampaign {
  campaign_id: string;
  name: string;
  objective: string;
  status: string;
  budget_type: string;
  budget: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  ad_account_id: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
}

export interface RedditInsights {
  connected: boolean;
  reason?: 'agency_not_connected' | 'not_linked' | 'token_expired';
  reddit_account_status: string;
  ad_accounts: RedditAdAccount[];
  campaigns: RedditCampaign[];
  token_valid: boolean;
  token_expires_at: string | null;
}

export interface RedditAgencyStatus {
  connected: boolean;
  connected_at: string | null;
  token_valid: boolean;
  token_expires_at: string | null;
  token_warning: boolean;
}

export interface SpotifyAgencyStatus {
  connected: boolean;
  connected_at: string | null;
  token_valid: boolean;
  token_expires_at: string | null;
  token_warning: boolean;
}

