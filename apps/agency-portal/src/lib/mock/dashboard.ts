export const MOCK_CLIENTS = [
  { id: 1, name: "Harbor Coffee Co.", type: "E-commerce", initials: "HC", color: "#e76f51", score: 48.2, fee: 2480, spend: 12400, pacing: 83, alerts: { count: 2, severity: "critical" as const }, aiMode: "manual" as const },
  { id: 2, name: "Nova Skincare", type: "Beauty", initials: "NS", color: "#2a9d8f", score: 91.4, fee: 3720, spend: 18600, pacing: 93, alerts: { count: 0, severity: "ok" as const }, aiMode: "auto" as const },
  { id: 3, name: "Peaks Outdoor", type: "Outdoor", initials: "PO", color: "#5c54c8", score: 67.2, fee: 1960, spend: 9800, pacing: 82, alerts: { count: 1, severity: "warning" as const }, aiMode: "hybrid" as const },
  { id: 4, name: "Forge Supplements", type: "Health", initials: "FS", color: "#d4860a", score: 55.8, fee: 2820, spend: 14100, pacing: 79, alerts: { count: 1, severity: "critical" as const }, aiMode: "manual" as const },
  { id: 5, name: "Solstice Home", type: "Home & Living", initials: "SH", color: "#2d9e5a", score: 83.1, fee: 1360, spend: 6800, pacing: 88, alerts: { count: 0, severity: "ok" as const }, aiMode: "hybrid" as const },
  { id: 6, name: "Verdant Plant Co.", type: "Lifestyle", initials: "VP", color: "#c85a3d", score: 87.4, fee: 840, spend: 4200, pacing: 91, alerts: { count: 0, severity: "ok" as const }, aiMode: "auto" as const },
  { id: 7, name: "Luxe Threads", type: "Fashion", initials: "LX", color: "#9b5de5", score: 71.9, fee: 2240, spend: 11200, pacing: 86, alerts: { count: 2, severity: "warning" as const }, aiMode: "hybrid" as const },
  { id: 8, name: "Luminary Studio", type: "Photography", initials: "LY", color: "#2a9d8f", score: 82.6, fee: 1480, spend: 7400, pacing: 90, alerts: { count: 0, severity: "ok" as const }, aiMode: "auto" as const },
  { id: 9, name: "Bluebell Boutique", type: "Retail", initials: "BB", color: "#2a9d8f", score: 72.4, fee: 1100, spend: 5500, pacing: 85, alerts: { count: 1, severity: "warning" as const }, aiMode: "hybrid" as const },
  { id: 10, name: "Crest Athletics", type: "Sports", initials: "CA", color: "#0077b5", score: 78.3, fee: 1600, spend: 8000, pacing: 87, alerts: { count: 0, severity: "ok" as const }, aiMode: "auto" as const },
  { id: 11, name: "Amber Grove Wines", type: "Beverages", initials: "AG", color: "#d4860a", score: 75.1, fee: 900, spend: 4500, pacing: 84, alerts: { count: 0, severity: "ok" as const }, aiMode: "hybrid" as const },
  { id: 12, name: "Riverstone Realty", type: "Real Estate", initials: "RR", color: "#5c54c8", score: 69.8, fee: 2200, spend: 11000, pacing: 80, alerts: { count: 1, severity: "warning" as const }, aiMode: "manual" as const },
];

export const MOCK_INSIGHTS = [
  { id: 1, client: "Harbor Coffee", platform: "TikTok", platformClass: "tiktok", severity: "critical" as const, text: "Creative fatigue on Summer Blend — frequency at 4.2x. CPM up 38%. Refresh creative or reallocate $800 to Meta.", impact: "+14–18% ROAS within 48h" },
  { id: 2, client: "Forge Supps", platform: "YouTube", platformClass: "youtube", severity: "warning" as const, text: "View-through rate dropped 22% since Monday. Pre-roll needs refresh. CTR 0.8% vs 1.4% benchmark.", impact: "+8–12% CTR recovery" },
  { id: 3, client: "Peaks Outdoor", platform: "Meta", platformClass: "meta", severity: "opportunity" as const, text: "Retargeting audience too narrow at 28k users — under-pacing. Expand window from 30 to 60 days.", impact: "Pacing → 95%+, no extra cost" },
  { id: 4, client: "Nova Skincare", platform: "Meta", platformClass: "meta", severity: "opportunity" as const, text: "Lookalike 1% converting at $9.81 cost/conv, frequency 1.6x. Room to scale — increase daily budget $200→$340.", impact: "+180 conversions/month" },
  { id: 5, client: "Luxe Threads", platform: "Google", platformClass: "google", severity: "warning" as const, text: "Search impression share dropped 18%. Competitors bidding up branded terms. +12% bid on exact match.", impact: "Recover ~340 clicks/week" },
  { id: 6, client: "Solstice Home", platform: "Meta", platformClass: "meta", severity: "opportunity" as const, text: "Video completion 68% — well above 45% portfolio avg. Allocate more budget before fatigue sets in.", impact: "+22% conversions at same CPC" },
];

export const MOCK_CAMPAIGNS = [
  { id: 1, clientId: 1, name: "Summer Blend Push", platform: "Meta", status: "active" as const, budget: 5000, spend: 3800, pacing: 76, roas: 2.1, cpa: 18.40 },
  { id: 2, clientId: 1, name: "Cold Brew TikTok", platform: "TikTok", status: "active" as const, budget: 3000, spend: 2600, pacing: 87, roas: 1.4, cpa: 24.10 },
  { id: 3, clientId: 2, name: "Glow Serum Launch", platform: "Meta", status: "active" as const, budget: 8000, spend: 7200, pacing: 90, roas: 4.2, cpa: 9.80 },
  { id: 4, clientId: 2, name: "Skincare Routine YT", platform: "YouTube", status: "active" as const, budget: 4000, spend: 3100, pacing: 78, roas: 3.1, cpa: 12.50 },
  { id: 5, clientId: 3, name: "Spring Gear Sale", platform: "Meta", status: "paused" as const, budget: 4000, spend: 3200, pacing: 80, roas: 2.8, cpa: 15.00 },
  { id: 6, clientId: 4, name: "Protein Launch", platform: "Google", status: "active" as const, budget: 6000, spend: 4700, pacing: 78, roas: 1.9, cpa: 22.30 },
  { id: 7, clientId: 5, name: "Home Decor Collection", platform: "Meta", status: "active" as const, budget: 3000, spend: 2600, pacing: 87, roas: 3.5, cpa: 11.20 },
  { id: 8, clientId: 7, name: "Fall Fashion", platform: "Meta", status: "active" as const, budget: 5000, spend: 4300, pacing: 86, roas: 2.6, cpa: 16.80 },
  { id: 9, clientId: 7, name: "Branded Search", platform: "Google", status: "active" as const, budget: 3000, spend: 2500, pacing: 83, roas: 5.1, cpa: 8.40 },
];

export const MOCK_PLATFORMS = [
  { id: "meta", name: "Meta", icon: "f", iconBg: "#e8effe", iconColor: "#1877f2", accounts: 8, spend: "$38.4k", score: 82.4, status: "connected" as const, lastSynced: "2 min ago" },
  { id: "google", name: "Google Ads", icon: "G", iconBg: "#fdecea", iconColor: "#ea4335", accounts: 7, spend: "$22.1k", score: 78.1, status: "connected" as const, lastSynced: "5 min ago" },
  { id: "tiktok", name: "TikTok", icon: "T", iconBg: "#e6f9fb", iconColor: "#00b8c4", accounts: 5, spend: "$14.2k", score: 64.8, status: "connected" as const, lastSynced: "10 min ago" },
  { id: "linkedin", name: "LinkedIn", icon: "in", iconBg: "#e8f0f8", iconColor: "#0077b5", accounts: 3, spend: "$6.4k", score: 49.2, status: "disconnected" as const, lastSynced: "Never" },
  { id: "snapchat", name: "Snapchat", icon: "👻", iconBg: "#fffbe6", iconColor: "#FFCC00", accounts: 0, spend: "$0", score: 0, status: "not_connected" as const, lastSynced: "Never" },
  { id: "pinterest", name: "Pinterest", icon: "P", iconBg: "#fdecea", iconColor: "#e60023", accounts: 0, spend: "$0", score: 0, status: "not_connected" as const, lastSynced: "Never" },
  { id: "reddit", name: "Reddit", icon: "R", iconBg: "#fff0e6", iconColor: "#ff4500", accounts: 0, spend: "$0", score: 0, status: "not_connected" as const, lastSynced: "Never" },
  { id: "microsoft", name: "Microsoft Ads", icon: "M", iconBg: "#e8f0f8", iconColor: "#00a4ef", accounts: 0, spend: "$0", score: 0, status: "not_connected" as const, lastSynced: "Never" },
  { id: "spotify", name: "Spotify", icon: "S", iconBg: "#e8f7ef", iconColor: "#1DB954", accounts: 0, spend: "$0", score: 0, status: "not_connected" as const, lastSynced: "Never" },
];

export const MOCK_TEAM = [
  { id: 1, name: "James Lewis", email: "james@mediaco.agency", initials: "JL", color: "#e76f51", role: "admin" as const, status: "active" as const, lastActive: "Now" },
  { id: 2, name: "Sophie Reed", email: "sophie@mediaco.agency", initials: "SR", color: "#2a9d8f", role: "manager" as const, status: "active" as const, lastActive: "2 hrs ago" },
  { id: 3, name: "Tom Keller", email: "tom@mediaco.agency", initials: "TK", color: "#5c54c8", role: "viewer" as const, status: "active" as const, lastActive: "Yesterday" },
  { id: 4, name: "Rita Novak", email: "rita@mediaco.agency", initials: "RN", color: "#d4860a", role: "viewer" as const, status: "invited" as const, lastActive: "Never" },
];
