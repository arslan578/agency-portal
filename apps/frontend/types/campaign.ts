export interface Campaign {
    id: number;
    plan_id?: number;
    status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    account_id: number;
    client_id?: number;
    name: string;
    total_budget_cents: number;
    audience_id?: number;
    goal?: string;
    platform_allocations: Record<string, number>;
    platform_campaign_ids: Record<string, string>;
    media_url?: string;
    media_type?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Audience {
    id: number;
    account_id: number;
    name: string;
    description?: string;
    definition: {
        geo: string[];
        languages: string[];
        interests: string[];
        keywords?: string[];
        exclusions?: string[];
    };
    estimated_reach?: number;
}

export interface ReportRecord {
    date: string;
    platform: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
}

