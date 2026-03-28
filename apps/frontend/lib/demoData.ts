import type { Campaign, ReportRecord } from '@/types/campaign';
import type { Audience } from '@/types/campaign';
import { PlatformScore, SweetSpotSummary } from '@/types/intelligence';

export const isDemoMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem('kaivo_token') === 'demo-token';
    } catch {
        return false;
    }
};

export const demoAudiences: Audience[] = [
    {
        id: 201,
        account_id: 1,
        name: 'US Women 25-45 Luxury Beauty Shoppers',
        description: 'Target audience for luxury beauty products in the US',
        definition: {
            geo: ['US'],
            languages: ['en'],
            interests: ['beauty', 'skincare', 'luxury goods', 'cosmetics', 'wellness']
        },
        estimated_reach: 125000
    },
    {
        id: 202,
        account_id: 1,
        name: 'High Intent Tech Buyers',
        description: 'Tech enthusiasts who have shown purchase intent',
        definition: {
            geo: ['US', 'CA'],
            languages: ['en'],
            interests: ['technology', 'gadgets', 'software', 'apps', 'innovation']
        },
        estimated_reach: 89000
    },
    {
        id: 203,
        account_id: 1,
        name: 'Gen Z Social Media Enthusiasts',
        description: 'Young social media users interested in entertainment and trends',
        definition: {
            geo: ['US', 'GB', 'CA'],
            languages: ['en'],
            interests: ['social media', 'entertainment', 'music', 'fashion', 'trends']
        },
        estimated_reach: 210000
    }
];

export interface CreativeVariant {
    text: string;
    tone: string;
    rationale: string;
    score: number;
}

export interface CreativeVariants {
    headline_short?: CreativeVariant[];
    headline_long?: CreativeVariant[];
    body?: CreativeVariant[];
    cta?: CreativeVariant[];
    keywords?: CreativeVariant[];
}

export const demoCreativeVariants: CreativeVariants = {
    headline_short: [
        {
            text: "Limited Time: 30% Off Everything",
            tone: "promotional",
            rationale: "Creates urgency with limited time offer",
            score: 0.89
        },
        {
            text: "Unleash Your Potential Today",
            tone: "inspirational",
            rationale: "Appeals to personal growth motivation",
            score: 0.85
        },
        {
            text: "Premium Quality You Can Trust",
            tone: "authoritative",
            rationale: "Emphasizes trust and quality",
            score: 0.82
        }
    ],
    headline_long: [
        {
            text: "Transform Your Skin in Just 7 Days - Guaranteed Results",
            tone: "benefit-driven",
            rationale: "Highlights quick results with guarantee",
            score: 0.92
        },
        {
            text: "The Ultimate Skincare Solution for Busy Professionals",
            tone: "solution-focused",
            rationale: "Targets busy professionals with convenience",
            score: 0.87
        }
    ],
    body: [
        {
            text: "Experience the difference with our scientifically-formulated skincare products. Our customers see visible results in as little as one week, with 95% satisfaction rates.",
            tone: "informative",
            rationale: "Provides scientific backing and statistics",
            score: 0.91
        },
        {
            text: "Join thousands of satisfied customers who have transformed their skin with our premium ingredients. Free shipping and 30-day money-back guarantee.",
            tone: "social-proof",
            rationale: "Uses social proof and risk reversal",
            score: 0.88
        },
        {
            text: "Perfect for sensitive skin types. Dermatologist-tested and cruelty-free formulas that deliver results without irritation.",
            tone: "reassuring",
            rationale: "Addresses concerns about sensitive skin",
            score: 0.85
        }
    ],
    cta: [
        {
            text: "Shop Now",
            tone: "direct",
            rationale: "Clear and direct call to action",
            score: 0.95
        },
        {
            text: "Claim Your Discount",
            tone: "urgent",
            rationale: "Creates urgency with discount claim",
            score: 0.90
        },
        {
            text: "Start Free Trial",
            tone: "risk-free",
            rationale: "Removes purchase barrier with free trial",
            score: 0.87
        }
    ],
    keywords: [
        {
            text: "skincare",
            tone: "descriptive",
            rationale: "High search volume beauty term",
            score: 0.92
        },
        {
            text: "anti aging",
            tone: "benefit-focused",
            rationale: "Targets anti-aging concern",
            score: 0.89
        },
        {
            text: "natural beauty",
            tone: "value-driven",
            rationale: "Appeals to natural beauty trend",
            score: 0.86
        }
    ]
}

// Intelligence Demo Data
export const demoPlatformScores: PlatformScore[] = [
    {
        platform: 'meta',
        umi_score: 87.5,
        cluster_scores: {
            visibility: 85,
            engagement: 90,
            conversion_power: 82,
            efficiency: 92,
            quality_stability: 88
        },
        signal: {
            direction: 'increase',
            priority: 'high',
            reason: 'Strong engagement and conversion metrics, increase budget by 20%'
        }
    },
    {
        platform: 'google_ads',
        umi_score: 76.2,
        cluster_scores: {
            visibility: 88,
            engagement: 72,
            conversion_power: 75,
            efficiency: 68,
            quality_stability: 82
        },
        signal: {
            direction: 'hold',
            priority: 'medium',
            reason: 'Steady performance, maintain current budget allocation'
        }
    },
    {
        platform: 'tiktok',
        umi_score: 62.1,
        cluster_scores: {
            visibility: 92,
            engagement: 85,
            conversion_power: 45,
            efficiency: 58,
            quality_stability: 65
        },
        signal: {
            direction: 'decrease',
            priority: 'high',
            reason: 'Low conversion power despite high engagement, reduce budget by 15%'
        }
    }
];

export const demoSweetSpotSummary: SweetSpotSummary = {
    top_platforms: ['meta', 'youtube'],
    losing_momentum: ['x', 'snapchat'],
    incremental_budget_recommendation: 'Shift 15% of budget from underperforming platforms to top performers',
    narrative_smb: 'Meta is showing exceptional performance with high engagement and conversion rates. Consider increasing budget allocation to capitalize on this opportunity.',
    narrative_agency: 'Meta platform demonstrates superior performance across all metrics. Recommend increasing investment by 20% while reducing spend on lower-performing channels.'
};

export const demoCampaigns: Campaign[] = [
    {
        id: 1001,
        account_id: 1,
        status: 'ACTIVE',
        name: 'Prospecting – Meta & Google – Q2',
        total_budget_cents: 2500000, // $25,000
        audience_id: 201,
        goal: 'Conversions – Ecommerce',
        platform_allocations: {
            meta: 15000,
            google_ads: 10000,
        },
        platform_campaign_ids: {
            meta: 'META_DEMO_1001',
            google_ads: 'GOOG_DEMO_1001',
        },
        media_url: '',
        media_type: 'image',
        created_at: '2025-05-01T00:00:00Z',
        updated_at: '2025-05-15T00:00:00Z',
    },
    {
        id: 1002,
        account_id: 1,
        status: 'ACTIVE',
        name: 'Retargeting – High Intent Visitors',
        total_budget_cents: 1200000, // $12,000
        audience_id: 202,
        goal: 'Retargeting – Add to Cart',
        platform_allocations: {
            meta: 8000,
            google_ads: 4000,
        },
        platform_campaign_ids: {
            meta: 'META_DEMO_1002',
            google_ads: 'GOOG_DEMO_1002',
        },
        media_url: '',
        media_type: 'image',
        created_at: '2025-05-05T00:00:00Z',
        updated_at: '2025-05-16T00:00:00Z',
    },
    {
        id: 1003,
        account_id: 1,
        status: 'COMPLETED',
        name: 'Brand Awareness – TikTok',
        total_budget_cents: 800000, // $8,000
        audience_id: 203,
        goal: 'Awareness – New Audience',
        platform_allocations: {
            tiktok: 8000,
        },
        platform_campaign_ids: {
            tiktok: 'TT_DEMO_1003',
        },
        media_url: '',
        media_type: 'video',
        created_at: '2025-04-01T00:00:00Z',
        updated_at: '2025-04-30T00:00:00Z',
    },
];

// Simple 14‑day synthetic performance time series per campaign
const makeTimeSeries = (
    campaignId: number,
    platform: string,
    startDate: string,
    days: number,
    base: { impressions: number; clicks: number; conversions: number; spend: number },
): ReportRecord[] => {
    const start = new Date(startDate);
    const rows: ReportRecord[] = [];

    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const factor = 0.8 + (i / days) * 0.6; // light upward trend
        rows.push({
            date: d.toISOString().slice(0, 10),
            platform,
            impressions: Math.round(base.impressions * factor),
            clicks: Math.round(base.clicks * factor),
            conversions: Math.round(base.conversions * factor),
            spend: parseFloat((base.spend * factor).toFixed(2)),
        });
    }

    return rows;
};

const demoReportsByCampaign: Record<number, ReportRecord[]> = {
    1001: [
        ...makeTimeSeries(1001, 'meta', '2025-05-01', 14, {
            impressions: 25000,
            clicks: 900,
            conversions: 80,
            spend: 650,
        }),
        ...makeTimeSeries(1001, 'google_ads', '2025-05-01', 14, {
            impressions: 18000,
            clicks: 600,
            conversions: 55,
            spend: 450,
        }),
    ],
    1002: [
        ...makeTimeSeries(1002, 'meta', '2025-05-01', 14, {
            impressions: 14000,
            clicks: 700,
            conversions: 95,
            spend: 520,
        }),
        ...makeTimeSeries(1002, 'google_ads', '2025-05-01', 14, {
            impressions: 9000,
            clicks: 380,
            conversions: 40,
            spend: 260,
        }),
    ],
    1003: [
        ...makeTimeSeries(1003, 'tiktok', '2025-04-01', 14, {
            impressions: 32000,
            clicks: 750,
            conversions: 35,
            spend: 400,
        }),
    ],
};

export const getDemoCampaigns = (): Campaign[] => demoCampaigns;

export const getDemoCampaignReports = (campaignId: number | string): ReportRecord[] => {
    const id = typeof campaignId === 'string' ? parseInt(campaignId, 10) : campaignId;
    return demoReportsByCampaign[id] ?? [];
};

export const getDemoAudiences = (): Audience[] => demoAudiences;

export const getDemoCreativeVariants = (): CreativeVariants => demoCreativeVariants;

export const getDemoPlatformScores = (): PlatformScore[] => demoPlatformScores;

export const getDemoSweetSpotSummary = (): SweetSpotSummary => demoSweetSpotSummary;

