'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { useClients, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaBMStatus, BMAccount, RedditAgencyStatus } from '@/lib/api/contracts';
import { MOCK_PLATFORMS } from '@/lib/mock/dashboard';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '1340998947829390';
const META_PENDING_CODE_KEY = 'kaivo_meta_oauth_code';
const REDDIT_CLIENT_ID = process.env.NEXT_PUBLIC_REDDIT_CLIENT_ID || '';
const REDDIT_REDIRECT_URI_OVERRIDE = process.env.NEXT_PUBLIC_REDDIT_REDIRECT_URI || '';

/** Template-matched sync log rows (UI only; no backend). */
const SYNC_LOG_STATIC_ROWS: {
  icon: 'ok' | 'err' | 'run';
  text: React.ReactNode;
  badge: string;
  badgeClass: string;
  time: string;
}[] = [
  { icon: 'ok', text: (<><strong className="text-text-primary">Meta</strong> — Full sync completed · 8 accounts · 47 campaigns · 312 ad sets</>), badge: 'Success', badgeClass: 'bg-green-light text-green', time: '4 min ago' },
  { icon: 'ok', text: (<><strong className="text-text-primary">Google Ads</strong> — Full sync completed · 7 accounts · 34 campaigns · 189 ad groups</>), badge: 'Success', badgeClass: 'bg-green-light text-green', time: '12 min ago' },
  { icon: 'err', text: (<><strong className="text-text-primary">TikTok</strong> — OAuth token expired · Sync failed · 5 accounts affected · Action required</>), badge: 'Failed', badgeClass: 'bg-red-light text-red', time: '6 hrs ago' },
  { icon: 'ok', text: (<><strong className="text-text-primary">Meta</strong> — Harbor Coffee Co. account added · 5 campaigns pulled · 90-day historical data loaded</>), badge: 'Success', badgeClass: 'bg-green-light text-green', time: '2 days ago' },
  { icon: 'ok', text: (<><strong className="text-text-primary">Google Ads</strong> — Nova Skincare account activated · 6 campaigns · 60-day history loaded</>), badge: 'Success', badgeClass: 'bg-green-light text-green', time: '4 days ago' },
  { icon: 'ok', text: (<><strong className="text-text-primary">Meta</strong> — Bluebell Boutique deactivated · Account removed from active sync</>), badge: 'Removed', badgeClass: 'bg-surface-secondary text-text-muted', time: '6 days ago' },
];

const DATA_WINDOW_OPTS = ['30 days', '90 days', '6 months', '1 year'] as const;

/** Connect-modal chrome per platform name (template `platformMeta`; UI only). */
const CONNECT_MODAL_META: Record<string, { bg: string; color: string; letter: string; sub: string }> = {
  YouTube: { color: '#cc0000', bg: '#fff0f0', letter: '▶', sub: 'Connect via your Google Ads Manager Account — no separate login needed.' },
  LinkedIn: { color: '#0077b5', bg: '#e8f0f8', letter: 'in', sub: 'Authorise Kaivo in LinkedIn Campaign Manager to pull client accounts.' },
  Snapchat: { color: '#FFCC00', bg: '#fffbe6', letter: '👻', sub: 'Connect via Snapchat Business to access client Ads Manager accounts.' },
  Pinterest: { color: '#e60023', bg: '#fdecea', letter: 'P', sub: 'Authorise Kaivo in Pinterest Ads Manager to pull client accounts.' },
  Reddit: { color: '#ff4500', bg: '#fff0ec', letter: 'r', sub: 'Connect via Reddit Ads to access client ad accounts.' },
  'Microsoft Ads': { color: '#0078d4', bg: '#e8f0fe', letter: 'M', sub: 'Authorise Kaivo in Microsoft Advertising to pull client accounts.' },
  Spotify: { color: '#1db954', bg: '#e8f7ef', letter: '♪', sub: 'Connect via Spotify Ad Studio to pull client ad accounts.' },
  'X (Twitter)': { color: '#000', bg: '#f0f0f0', letter: '𝕏', sub: 'Authorise Kaivo in X Ads Manager to pull client ad accounts.' },
};

const CONNECT_MODAL_STEPS = [
  'Authorise Kaivo in your ad platform account',
  'Select which client accounts to pull into Kaivo',
  'Choose how much historical data to load',
  'Kaivo syncs and clients appear in your dashboard',
] as const;

// ── Icons & Helpers ──────────────────────────────────────────────────────────

function MetaIcon({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: '#e8effe', color: '#1877f2' }}>f</div>
  );
}

function formatDateRelative(iso: string | null | undefined) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hrs ago`;
  return new Date(iso).toLocaleDateString();
}

function getErrorMessage(err: unknown, fallback: string) {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function getRedditRedirectUri() {
  if (REDDIT_REDIRECT_URI_OVERRIDE.trim()) return REDDIT_REDIRECT_URI_OVERRIDE.trim();
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/integrations/reddit/oauth/callback`;
  }
  return '/integrations/reddit/oauth/callback';
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: session } = useSession();
  const { accessToken, agencyId } = useApiAuth();
  const { clients } = useClients();
  const isAdmin =
    session?.user?.isSuperuser === true ||
    (session?.user?.agencyRole ?? '').toLowerCase().includes('admin');

  // Meta BM State
  const [metaStatus, setMetaStatus] = useState<MetaBMStatus | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [metaAutoLinking, setMetaAutoLinking] = useState(false);
  const [redditStatus, setRedditStatus] = useState<RedditAgencyStatus | null>(null);
  const [redditLoading, setRedditLoading] = useState(true);
  const [redditConnecting, setRedditConnecting] = useState(false);
  const [redditAutoLinking, setRedditAutoLinking] = useState(false);

  // Panels & Modals
  const [showAccountsPanel, setShowAccountsPanel] = useState(false);
  const [showRedditAccountsPanel, setShowRedditAccountsPanel] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [bmAccounts, setBmAccounts] = useState<BMAccount[]>([]);
  const [bmAccountsLoading, setBmAccountsLoading] = useState(false);
  const [redditAccounts, setRedditAccounts] = useState<BMAccount[]>([]);
  const [redditAccountsLoading, setRedditAccountsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [panelPlatform, setPanelPlatform] = useState<string | null>(null);
  const [connectModalPlatform, setConnectModalPlatform] = useState<string | null>(null);
  const [panelDataWindow, setPanelDataWindow] = useState<string>('90 days');
  const [connectDataWindow, setConnectDataWindow] = useState<string>('90 days');
  const [pendingMetaCode, setPendingMetaCode] = useState<string | null>(null);
  const metaStatusRequestIdRef = useRef(0);

  // ── Fetching Data ──────────────────────────────────────────────────────────

  const fetchMetaStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    const requestId = ++metaStatusRequestIdRef.current;
    setMetaLoading(true);
    try {
      const data = await apiClient.get<MetaBMStatus>(
        API_ENDPOINTS.META.STATUS(agencyId),
        { accessToken, agencyId },
      );
      if (requestId === metaStatusRequestIdRef.current) {
        setMetaStatus(data);
      }
    } catch {
      if (requestId === metaStatusRequestIdRef.current) {
        setMetaStatus(null);
      }
    } finally {
      if (requestId === metaStatusRequestIdRef.current) {
        setMetaLoading(false);
      }
    }
  }, [accessToken, agencyId]);

  const fetchRedditStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setRedditLoading(true);
    try {
      const data = await apiClient.get<RedditAgencyStatus>(
        API_ENDPOINTS.REDDIT.STATUS(agencyId),
        { accessToken, agencyId },
      );
      setRedditStatus(data);
    } catch {
      setRedditStatus(null);
    } finally {
      setRedditLoading(false);
    }
  }, [accessToken, agencyId]);

  useEffect(() => {
    void fetchMetaStatus();
    void fetchRedditStatus();
  }, [fetchMetaStatus, fetchRedditStatus]);

  const fetchBmAccounts = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setBmAccountsLoading(true);
    try {
      const data = await apiClient.get<{ connected: boolean; accounts: BMAccount[] }>(
        API_ENDPOINTS.META.ACCOUNTS(agencyId),
        { accessToken, agencyId },
      );
      setBmAccounts(data.accounts || []);
    } catch {
      setBmAccounts([]);
    } finally {
      setBmAccountsLoading(false);
    }
  }, [accessToken, agencyId]);

  const fetchRedditAccounts = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setRedditAccountsLoading(true);
    try {
      const data = await apiClient.get<{ connected: boolean; accounts: BMAccount[] }>(
        API_ENDPOINTS.REDDIT.ACCOUNTS(agencyId),
        { accessToken, agencyId },
      );
      setRedditAccounts(data.accounts || []);
    } catch {
      setRedditAccounts([]);
    } finally {
      setRedditAccountsLoading(false);
    }
  }, [accessToken, agencyId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_callback') !== '1') return;
    const code = params.get('code');
    const url = new URL(window.location.href);
    url.searchParams.delete('meta_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_reason');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url.toString());

    if (!code) {
      toast.error('Meta authorisation did not return a valid code. Please try again.');
      return;
    }
    window.sessionStorage.setItem(META_PENDING_CODE_KEY, code);
    setPendingMetaCode(code);
  }, []);

  useEffect(() => {
    if (pendingMetaCode || typeof window === 'undefined') return;
    const storedCode = window.sessionStorage.getItem(META_PENDING_CODE_KEY);
    if (storedCode) setPendingMetaCode(storedCode);
  }, [pendingMetaCode]);

  useEffect(() => {
    if (!pendingMetaCode || !accessToken || !agencyId || metaConnecting) return;
    (async () => {
      setMetaConnecting(true);
      try {
        const exactRedirectUri = `${window.location.origin}/integrations?meta_callback=1`;
        await apiClient.post(
          API_ENDPOINTS.META.CONNECT(agencyId),
          { code: pendingMetaCode, redirectUri: exactRedirectUri },
          { accessToken, agencyId },
        );
        toast.success('Meta Business Manager connected!');
        await fetchMetaStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect Meta'));
      } finally {
        setMetaConnecting(false);
        setPendingMetaCode(null);
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(META_PENDING_CODE_KEY);
        }
      }
    })();
  }, [pendingMetaCode, accessToken, agencyId, metaConnecting, fetchMetaStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reddit_callback') !== '1') return;
    const code = params.get('code');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    if (oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('reddit_callback');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
      toast.error(oauthErrorDescription || oauthError || 'Reddit authorization failed');
      return;
    }

    if (!code || !accessToken || !agencyId || redditConnecting) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('reddit_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    (async () => {
      setRedditConnecting(true);
      try {
        const exactRedirectUri = getRedditRedirectUri();
        await apiClient.post(
          API_ENDPOINTS.REDDIT.CONNECT(agencyId),
          { code, redirectUri: exactRedirectUri },
          { accessToken, agencyId },
        );
        toast.success('Reddit connected!');
        fetchRedditStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect Reddit'));
      } finally {
        setRedditConnecting(false);
      }
    })();
  }, [accessToken, agencyId, redditConnecting, fetchRedditStatus]);

  const handleConnectTrigger = (platform: string) => {
    if (platform === 'Meta') {
      const redirectUri = `${window.location.origin}/integrations?meta_callback=1`;
      const scopes = ['business_management', 'ads_management', 'ads_read'].join(',');
      const state = Math.random().toString(36).slice(2);
      window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
    } else if (platform === 'Reddit') {
      if (!REDDIT_CLIENT_ID) {
        toast.error('Missing NEXT_PUBLIC_REDDIT_CLIENT_ID');
        return;
      }
      const redirectUri = getRedditRedirectUri();
      const state = Math.random().toString(36).slice(2);
      const scopes = 'adsread';
      window.location.href = `https://www.reddit.com/api/v1/authorize?client_id=${encodeURIComponent(REDDIT_CLIENT_ID)}&response_type=code&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}&duration=permanent&scope=${encodeURIComponent(scopes)}`;
    } else {
      toast.info(`${platform} integration coming soon!`);
    }
  };

  const handleDisconnectMeta = async () => {
    if (!accessToken || !agencyId) return;
    if (!window.confirm('Disconnect Meta Business Manager? This will reset all client mappings.')) return;
    try {
      await apiClient.post(API_ENDPOINTS.META.DISCONNECT(agencyId), {}, { accessToken, agencyId });
      toast.success('Meta Business Manager disconnected');
      setMetaStatus(null);
      setBmAccounts([]);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to disconnect'));
    }
  };

  const handleAutoLink = async () => {
    if (!accessToken || !agencyId) return;
    setMetaAutoLinking(true);
    try {
      const result = await apiClient.post<{ matched: number }>(
        API_ENDPOINTS.META.AUTO_LINK(agencyId), {}, { accessToken, agencyId },
      );
      toast.success(`Successfully auto-linked ${result.matched} ad accounts.`);
      fetchMetaStatus();
      if (showAccountsPanel) fetchBmAccounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Auto-link failed'));
    } finally {
      setMetaAutoLinking(false);
    }
  };

  const handleManualLink = async (clientId: number, adAccountId: string) => {
    if (!accessToken || !agencyId) return;
    try {
      await apiClient.post(
        API_ENDPOINTS.META.MANUAL_LINK(String(clientId)),
        { ad_account_id: adAccountId },
        { accessToken, agencyId },
      );
      toast.success('Account mapped successfully');
      fetchBmAccounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Mapping failed'));
    }
  };

  const handleDisconnectReddit = async () => {
    if (!accessToken || !agencyId) return;
    if (!window.confirm('Disconnect Reddit? This will reset all client mappings.')) return;
    try {
      await apiClient.post(API_ENDPOINTS.REDDIT.DISCONNECT(agencyId), {}, { accessToken, agencyId });
      toast.success('Reddit disconnected');
      setRedditStatus(null);
      setRedditAccounts([]);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to disconnect Reddit'));
    }
  };

  const handleAutoLinkReddit = async () => {
    if (!accessToken || !agencyId) return;
    setRedditAutoLinking(true);
    try {
      const result = await apiClient.post<{ matched: number }>(
        API_ENDPOINTS.REDDIT.AUTO_LINK(agencyId), {}, { accessToken, agencyId },
      );
      toast.success(`Successfully auto-linked ${result.matched} Reddit account(s).`);
      fetchRedditStatus();
      if (showRedditAccountsPanel) fetchRedditAccounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Auto-link failed'));
    } finally {
      setRedditAutoLinking(false);
    }
  };

  const handleManualLinkReddit = async (clientId: number, adAccountId: string) => {
    if (!accessToken || !agencyId) return;
    try {
      await apiClient.post(
        API_ENDPOINTS.REDDIT.MANUAL_LINK(String(clientId)),
        { ad_account_id: adAccountId },
        { accessToken, agencyId },
      );
      toast.success('Reddit account mapped successfully');
      fetchRedditAccounts();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Mapping failed'));
    }
  };

  // ── Derived State ──────────────────────────────────────────────────────────

  const metaConnected = metaStatus?.connected ?? false;
  const redditConnected = redditStatus?.connected ?? false;
  const filteredBmAccounts = useMemo(() => {
    if (!searchQuery) return bmAccounts;
    return bmAccounts.filter(acc => 
      acc.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.account_id.includes(searchQuery)
    );
  }, [bmAccounts, searchQuery]);

  const unlinkedClients = useMemo(() => {
    const linkedIds = new Set(
      bmAccounts.map((a) => a.linked_client_id).filter((id): id is string => id != null && id !== ''),
    );
    return clients.filter((c) => !linkedIds.has(String(c.id)));
  }, [clients, bmAccounts]);
  const unlinkedRedditClients = useMemo(() => {
    const linkedIds = new Set(
      redditAccounts.map((a) => a.linked_client_id).filter((id): id is string => id != null && id !== ''),
    );
    return clients.filter((c) => !linkedIds.has(String(c.id)));
  }, [clients, redditAccounts]);

  const activeBmCount = bmAccounts.filter(a => a.linked_client_id !== null).length;
  const activeRedditCount = redditAccounts.filter(a => a.linked_client_id !== null).length;

  const metaManagedSpendDisplay = useMemo(() => {
    if (!bmAccounts.length) return '—';
    const total = bmAccounts.reduce((s, a) => s + (Number(a.spend) || 0), 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
  }, [bmAccounts]);

  // ── Animation Controllers ──────────────────────────────────────────────────

  useEffect(() => {
    if (showAccountsPanel || showRedditAccountsPanel || panelPlatform) {
      const frame = requestAnimationFrame(() => setPanelEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setPanelEntered(false);
  }, [showAccountsPanel, showRedditAccountsPanel, panelPlatform]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const handleRefreshAll = () => {
    void fetchMetaStatus();
    void fetchRedditStatus();
    toast.message('Refreshing connected platforms…');
  };

  return (
    <div className="relative flex flex-col h-full bg-surface-secondary font-sans">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-24 bg-gradient-animate opacity-15 blur-3xl rounded-[48px] -z-10"
      />
      <DashboardHeader
        title="Integrations"
        subtitle="Manage your platform connections and client accounts"
        actions={
          <button
            type="button"
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border bg-white text-text-primary hover:border-aqua hover:text-teal-deep transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" />
              <path d="M13.5 2.5v4h-4" />
            </svg>
            Refresh All
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-5">

          <div>
            <h2 className="text-[11px] font-bold tracking-[0.06em] uppercase text-text-muted mb-3.5">Connected Platforms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">

              {/* Meta — template plt-card */}
              <div className="glass-card bg-white border border-border rounded-[12px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-aqua/40">
                <div className="px-[18px] pt-[18px] pb-3.5 flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[20px] font-semibold shrink-0 bg-[#e8effe] text-[#1877f2] leading-none">
                    f
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-text-primary">Meta</h3>
                    <div
                      className={`flex items-center gap-1.5 text-[11px] font-semibold mt-1 ${metaConnected ? 'text-green' : 'text-text-muted'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${metaConnected ? 'bg-green' : 'bg-text-muted'}`} />
                      {metaConnected ? 'Connected · Business Manager' : 'Not connected'}
                    </div>
                    {metaConnected && (
                      <p className="text-[11px] text-text-muted font-semibold mt-2">
                        {bmAccounts.length
                          ? `${activeBmCount} of ${bmAccounts.length} accounts active`
                          : 'Loading account list…'}
                      </p>
                    )}
                  </div>
                </div>

                {metaConnected && (
                  <div className="grid grid-cols-2 border-t border-b border-border">
                    <div className="px-4 py-2.5 border-r border-border">
                      <div className="text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-1">Last sync</div>
                      <div className="font-mono text-[13px] font-semibold text-text-primary">
                        {formatDateRelative(metaStatus?.connected_at)}
                      </div>
                    </div>
                    <div className="px-4 py-2.5">
                      <div className="text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-1">Managed spend</div>
                      <div className="font-mono text-[13px] font-semibold text-text-primary">{metaManagedSpendDisplay}</div>
                    </div>
                  </div>
                )}

                <div className="px-3.5 py-3 flex flex-wrap items-center gap-2">
                  {metaConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountsPanel(true);
                          fetchBmAccounts();
                        }}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md"
                      >
                        Manage Accounts
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.info('Sync runs on a schedule; use Refresh All to pull latest status.')}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-secondary hover:border-aqua/60 hover:text-teal-deep transition-colors shadow-sm hover:shadow-md"
                      >
                        ↻ Sync
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectMeta}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-muted hover:border-red hover:text-red transition-colors shadow-sm hover:shadow-md ml-auto"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnectTrigger('Meta')}
                      className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md w-full"
                    >
                      Connect Meta
                    </button>
                  )}
                </div>
              </div>

              {/* Reddit */}
              <div className="glass-card bg-white border border-border rounded-[12px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-aqua/40">
                <div className="px-[18px] pt-[18px] pb-3.5 flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[20px] font-semibold shrink-0 bg-[#fff0ec] text-[#ff4500] leading-none">
                    r
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-text-primary">Reddit</h3>
                    <div
                      className={`flex items-center gap-1.5 text-[11px] font-semibold mt-1 ${redditConnected ? 'text-green' : 'text-text-muted'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${redditConnected ? 'bg-green' : 'bg-text-muted'}`} />
                      {redditConnected ? 'Connected · Agency Token' : 'Not connected'}
                    </div>
                    {redditConnected && (
                      <p className="text-[11px] text-text-muted font-semibold mt-2">
                        {redditAccounts.length
                          ? `${activeRedditCount} of ${redditAccounts.length} accounts active`
                          : 'Loading account list…'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="px-3.5 py-3 flex flex-wrap items-center gap-2">
                  {redditConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRedditAccountsPanel(true);
                          fetchRedditAccounts();
                        }}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md"
                      >
                        Manage Accounts
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoLinkReddit}
                        disabled={redditAutoLinking}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-secondary hover:border-aqua/60 hover:text-teal-deep transition-colors shadow-sm hover:shadow-md disabled:opacity-50"
                      >
                        {redditAutoLinking ? 'Linking…' : 'Auto-link'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectReddit}
                        className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-muted hover:border-red hover:text-red transition-colors shadow-sm hover:shadow-md ml-auto"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnectTrigger('Reddit')}
                      className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md w-full"
                    >
                      Connect Reddit
                    </button>
                  )}
                </div>
              </div>

              {MOCK_PLATFORMS.filter((p) => p.status === 'connected' && p.id !== 'meta').map((p) => {
                const variant = 'integrationUiVariant' in p ? p.integrationUiVariant : 'connected_ok';
                const isError = variant === 'auth_error';
                return (
                  <div
                    key={p.id}
                    className="glass-card bg-white border border-border rounded-[12px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-aqua/40"
                  >
                    <div className="px-[18px] pt-[18px] pb-3.5 flex items-start gap-3.5">
                      <div
                        className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[20px] font-semibold shrink-0 leading-none"
                        style={{ background: p.iconBg, color: p.iconColor }}
                      >
                        {p.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-text-primary">{p.name}</h3>
                        <div
                          className={`flex items-center gap-1.5 text-[11px] font-semibold mt-1 ${isError ? 'text-red' : 'text-green'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isError ? 'bg-red' : 'bg-green'}`} />
                          {isError
                            ? 'Auth expired · Reconnect needed'
                            : p.id === 'google'
                              ? 'Connected · Manager Account'
                              : 'Connected'}
                        </div>
                        <p className="text-[11px] text-text-muted font-semibold mt-2">
                          {isError
                            ? `${p.accounts} accounts — sync paused`
                            : p.id === 'google'
                              ? '7 of 11 accounts active'
                              : `${p.accounts} accounts active`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-t border-b border-border">
                      <div className="px-4 py-2.5 border-r border-border">
                        <div className="text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-1">Last sync</div>
                        <div
                          className={`font-mono text-[13px] font-semibold ${isError ? 'text-red' : 'text-text-primary'}`}
                        >
                          {p.lastSynced}
                        </div>
                      </div>
                      <div className="px-4 py-2.5">
                        <div className="text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-1">Managed spend</div>
                        <div
                          className={`font-mono text-[13px] font-semibold ${isError ? 'text-text-muted' : 'text-text-primary'}`}
                        >
                          {isError ? 'Stale' : p.id === 'google' ? '$22,100' : p.spend}
                        </div>
                      </div>
                    </div>

                    <div className="px-3.5 py-3 flex flex-wrap items-center gap-2">
                      {isError ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              toast.info(`${p.name} re-authorisation coming soon.`);
                            }}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border-2 border-red bg-red text-white hover:opacity-90 transition-opacity"
                          >
                            ⚠ Reconnect
                          </button>
                          <button
                            type="button"
                            onClick={() => setPanelPlatform(p.id)}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-secondary hover:border-aqua/60 hover:text-teal-deep transition-colors shadow-sm hover:shadow-md"
                          >
                            Manage Accounts
                          </button>
                          <button
                            type="button"
                            onClick={() => toast.info('Disconnect is not available for this demo integration.')}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-muted hover:border-red hover:text-red transition-colors shadow-sm hover:shadow-md ml-auto"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setPanelPlatform(p.id)}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-teal-deep bg-teal-deep text-white hover:bg-teal-deep/90 transition-colors shadow-sm hover:shadow-md"
                          >
                            Manage Accounts
                          </button>
                          <button
                            type="button"
                            onClick={() => toast.info(`${p.name} sync is not wired yet.`)}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-secondary hover:border-aqua/60 hover:text-teal-deep transition-colors shadow-sm hover:shadow-md"
                          >
                            ↻ Sync
                          </button>
                          <button
                            type="button"
                            onClick={() => toast.info('Disconnect is not available for this demo integration.')}
                            className="text-[11.5px] font-semibold py-1.5 px-3 rounded-[7px] border border-border bg-white text-text-muted hover:border-red hover:text-red transition-colors shadow-sm hover:shadow-md ml-auto"
                          >
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-[11px] font-bold tracking-[0.06em] uppercase text-text-muted mb-3.5">Available Platforms</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {MOCK_PLATFORMS.filter((p) => p.status !== 'connected' && p.id !== 'reddit').map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setConnectModalPlatform(p.name)}
                  className="glass-card bg-white border border-border rounded-[12px] px-4 py-4 flex items-center gap-3 text-left opacity-75 hover:opacity-100 hover:border-aqua/60 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-semibold shrink-0 leading-none"
                    style={{ background: p.iconBg, color: p.iconColor }}
                  >
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text-primary truncate">{p.name}</div>
                    <div className="text-[10px] text-text-muted font-medium mt-0.5 truncate">
                      {'availSub' in p && p.availSub ? p.availSub : 'Connect to get started'}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-teal-deep shrink-0">Connect →</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card bg-white border border-border rounded-[12px] overflow-hidden shadow-sm">
            <div className="px-[18px] py-3.5 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-text-primary">Sync Activity</h3>
              <span className="text-[11px] text-text-muted font-semibold">Last 24 hours</span>
            </div>
            {SYNC_LOG_STATIC_ROWS.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-[18px] py-2.5 border-b border-border last:border-b-0 hover:bg-surface-hover/60 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0 ${
                    row.icon === 'ok'
                      ? 'bg-green-light text-green'
                      : row.icon === 'err'
                        ? 'bg-red-light text-red'
                        : 'bg-teal-light text-teal-deep'
                  }`}
                >
                  {row.icon === 'err' ? '✕' : '✓'}
                </div>
                <div className="flex-1 text-[12px] text-text-secondary font-medium min-w-0">{row.text}</div>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${row.badgeClass}`}>{row.badge}</span>
                <span className="text-[11px] text-text-muted font-semibold whitespace-nowrap shrink-0">{row.time}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── ACCOUNT MAPPING PANEL (Sliding) ────────────────────────────────── */}
      {showAccountsPanel && (
        <>
          <div
            className="fixed inset-0 z-[100] transition-opacity bg-black/40 backdrop-blur-sm"
            role="presentation"
            onClick={() => setShowAccountsPanel(false)}
          />
          <aside
            className={`fixed top-0 right-0 h-full w-[480px] max-w-[100vw] bg-white border-l border-border z-[101] shadow-2xl flex flex-col transition-transform duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${panelEntered ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <header className="px-5 py-[18px] border-b border-border-subtle flex items-center gap-3 bg-white text-text-primary shrink-0">
              <div className="w-9 h-9 rounded-lg bg-[#e8effe] text-[#1877f2] flex items-center justify-center text-base font-semibold shrink-0 leading-none">
                f
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-text-primary truncate">Manage Meta Accounts</h3>
                <p className="text-[11px] text-text-muted font-medium mt-0.5">
                  {bmAccounts.length
                    ? `${bmAccounts.length} accounts available in your Business Manager`
                    : 'Meta Business Manager'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountsPanel(false)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm text-text-muted hover:border-coral hover:text-coral transition-all shrink-0 ml-auto"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="px-5 py-3 border-b border-border flex items-center gap-2.5 shrink-0 bg-surface-secondary">
              <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-2.5 py-1.5 min-w-0">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-text-muted">
                  <circle cx="6.5" cy="6.5" r="5" />
                  <path d="M10.5 10.5L14 14" />
                </svg>
                <input
                  type="search"
                  placeholder="Search accounts…"
                  className="bg-transparent border-none outline-none text-xs flex-1 min-w-0 text-text-primary placeholder:text-text-muted"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => toast.info('Use per-account mapping below.')}
                className="text-[11px] font-semibold text-teal-deep whitespace-nowrap bg-transparent border-none cursor-pointer font-[inherit] p-0 hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => toast.info('Use per-account mapping below.')}
                className="text-[11px] font-semibold text-text-muted whitespace-nowrap bg-transparent border-none cursor-pointer font-[inherit] p-0 hover:underline"
              >
                Deselect all
              </button>
            </div>

            <div className="px-5 py-3 border-b border-border bg-surface-secondary shrink-0">
              <div className="text-[10px] font-semibold tracking-[0.06em] uppercase text-text-muted mb-2">
                Historical data to pull
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DATA_WINDOW_OPTS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPanelDataWindow(opt)}
                    className={`px-3 py-1 rounded-md border border-border text-[11px] font-semibold font-[inherit] cursor-pointer transition-colors ${
                      panelDataWindow === opt
                        ? 'bg-teal-deep border-teal-deep text-white'
                        : 'bg-white border-border text-text-muted hover:border-aqua/40'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-2 border-b border-border flex items-center gap-2 shrink-0 bg-surface-secondary">
              <button
                type="button"
                onClick={handleAutoLink}
                disabled={metaAutoLinking}
                className="h-9 px-4 rounded-lg bg-[#1877f2] text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
              >
                {metaAutoLinking ? 'Linking…' : '⚡ Auto-link'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-5 py-2 text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted bg-surface-secondary border-y border-border">
                Ad accounts under Business Manager
              </div>
              <div className="divide-y divide-border">
                {bmAccountsLoading ? (
                  <div className="p-10 text-center text-text-muted animate-pulse font-semibold italic">Fetching accounts…</div>
                ) : filteredBmAccounts.length === 0 ? (
                  <div className="p-10 text-center text-text-muted font-semibold italic">No accounts found</div>
                ) : filteredBmAccounts.map(acc => {
                  const linkedClient = acc.linked_client_id ? clients.find(c => c.id === Number(acc.linked_client_id)) : null;
                  return (
                    <div key={acc.account_id} className="px-5 py-[13px] hover:bg-[#faf7f2] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold text-white shrink-0 shadow-sm`} style={{ background: linkedClient ? '#007B5F' : '#FF7043' }}>
                            {acc.account_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text-primary leading-tight truncate">{acc.account_name}</div>
                            <div className="text-[10px] font-mono text-text-muted mt-1">{acc.account_id} · {acc.currency}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[12px] font-mono font-semibold text-text-primary">${acc.spend.toLocaleString()}</div>
                          <div className="text-[9px] font-semibold text-text-muted uppercase tracking-tighter">Spent MTD</div>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center gap-3">
                        {linkedClient ? (
                          <>
                             <div className="px-2.5 py-1 rounded-md bg-green-light text-green text-[10px] font-semibold border border-green/10">Connected</div>
                             <div className="text-xs font-semibold text-text-secondary truncate">→ {linkedClient.name}</div>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center gap-2">
                            <select 
                              className="flex-1 h-9 rounded-lg border border-border bg-white text-[11px] font-semibold px-3 outline-none focus:border-teal-deep transition-colors"
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) handleManualLink(Number(val), acc.account_id);
                              }}
                              value=""
                            >
                              <option value="">Map to client...</option>
                              {unlinkedClients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="px-5 py-3.5 border-t border-border bg-white flex items-center gap-2.5 shrink-0">
              <div className="text-[11px] text-text-muted font-semibold flex-1 min-w-0">
                {activeBmCount} account{activeBmCount !== 1 ? 's' : ''} linked to clients
              </div>
              <button
                type="button"
                onClick={() => setShowAccountsPanel(false)}
                className="px-4 py-2.5 rounded-lg bg-white border border-border text-[13px] font-semibold text-text-secondary hover:bg-surface-secondary/50 transition-colors font-[inherit] cursor-pointer shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAccountsPanel(false);
                  toast.info('Mappings save as you link accounts. Use Refresh All to pull latest status.');
                }}
                className="px-5 py-2.5 rounded-lg bg-teal-deep text-white border-none text-[13px] font-semibold font-[inherit] cursor-pointer hover:bg-teal-deep/90 transition-colors shrink-0"
              >
                Save &amp; Sync
              </button>
            </footer>
          </aside>
        </>
      )}

      {showRedditAccountsPanel && (
        <>
          <div
            className="fixed inset-0 z-[100] transition-opacity bg-black/40 backdrop-blur-sm"
            role="presentation"
            onClick={() => setShowRedditAccountsPanel(false)}
          />
          <aside
            className={`fixed top-0 right-0 h-full w-[480px] max-w-[100vw] bg-white border-l border-border z-[101] shadow-2xl flex flex-col transition-transform duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${panelEntered ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <header className="px-5 py-[18px] border-b border-border-subtle flex items-center gap-3 bg-white text-text-primary shrink-0">
              <div className="w-9 h-9 rounded-lg bg-[#fff0ec] text-[#ff4500] flex items-center justify-center text-base font-semibold shrink-0 leading-none">
                r
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-text-primary truncate">Manage Reddit Accounts</h3>
                <p className="text-[11px] text-text-muted font-medium mt-0.5">
                  {redditAccounts.length ? `${redditAccounts.length} accounts available` : 'Reddit Ads'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRedditAccountsPanel(false)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm text-text-muted hover:border-coral hover:text-coral transition-all shrink-0 ml-auto"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="px-5 py-2 border-b border-border flex items-center gap-2 shrink-0 bg-surface-secondary">
              <button
                type="button"
                onClick={handleAutoLinkReddit}
                disabled={redditAutoLinking}
                className="h-9 px-4 rounded-lg bg-[#ff4500] text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
              >
                {redditAutoLinking ? 'Linking…' : '⚡ Auto-link'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-5 py-2 text-[9px] font-semibold tracking-[0.06em] uppercase text-text-muted bg-surface-secondary border-y border-border">
                Reddit ad accounts
              </div>
              <div className="divide-y divide-border">
                {redditAccountsLoading ? (
                  <div className="p-10 text-center text-text-muted animate-pulse font-semibold italic">Fetching accounts…</div>
                ) : redditAccounts.length === 0 ? (
                  <div className="p-10 text-center text-text-muted font-semibold italic">No accounts found</div>
                ) : redditAccounts.map(acc => {
                  const linkedClient = acc.linked_client_id ? clients.find(c => c.id === Number(acc.linked_client_id)) : null;
                  return (
                    <div key={acc.account_id} className="px-5 py-[13px] hover:bg-[#faf7f2] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold text-white shrink-0 shadow-sm bg-[#ff7043]">
                            {acc.account_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text-primary leading-tight truncate">{acc.account_name}</div>
                            <div className="text-[10px] font-mono text-text-muted mt-1">{acc.account_id} · {acc.currency}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        {linkedClient ? (
                          <>
                            <div className="px-2.5 py-1 rounded-md bg-green-light text-green text-[10px] font-semibold border border-green/10">Connected</div>
                            <div className="text-xs font-semibold text-text-secondary truncate">→ {linkedClient.name}</div>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center gap-2">
                            <select
                              className="flex-1 h-9 rounded-lg border border-border bg-white text-[11px] font-semibold px-3 outline-none focus:border-teal-deep transition-colors"
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) handleManualLinkReddit(Number(val), acc.account_id);
                              }}
                              value=""
                            >
                              <option value="">Map to client...</option>
                              {unlinkedRedditClients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </>
      )}

      {panelPlatform && (() => {
        const selectedPlatform = MOCK_PLATFORMS.find((p) => p.id === panelPlatform);
        if (!selectedPlatform) return null;
        return (
          <>
            <div
              role="presentation"
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm cursor-pointer"
              onClick={() => setPanelPlatform(null)}
            />
            <aside
              className={`fixed top-0 right-0 z-[101] h-full w-[480px] max-w-[100vw] bg-white shadow-2xl flex flex-col border-l border-border transition-transform duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                panelEntered ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <header className="px-5 py-[18px] border-b border-border-subtle flex items-center gap-3 shrink-0">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-semibold shrink-0 leading-none"
                  style={{ background: selectedPlatform.iconBg, color: selectedPlatform.iconColor }}
                >
                  {selectedPlatform.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-text-primary truncate">
                    Manage {selectedPlatform.name} Accounts
                  </h3>
                  <p className="text-[11px] text-text-muted font-medium mt-0.5">
                    Platform management coming soon — same layout as Meta.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelPlatform(null)}
                  className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm text-text-muted hover:border-coral hover:text-coral transition-all shrink-0 ml-auto"
                  aria-label="Close"
                >
                  ✕
                </button>
              </header>
              <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
                <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
                  <div className="text-[10px] font-semibold tracking-[0.06em] uppercase text-text-muted">Sync status</div>
                  <div className="text-[12px] font-semibold text-text-primary mt-1">Last synced {selectedPlatform.lastSynced}</div>
                </div>
                <p className="text-[13px] text-text-muted font-medium py-6 text-center leading-relaxed">
                  Full account mapping and sync controls will appear here when this integration is live.
                </p>
              </div>
              <footer className="px-5 py-3.5 border-t border-border bg-white flex items-center gap-2.5 shrink-0">
                <div className="text-[11px] text-text-muted font-semibold flex-1">No accounts to save yet</div>
                <button
                  type="button"
                  onClick={() => setPanelPlatform(null)}
                  className="px-4 py-2.5 rounded-lg bg-white border border-border text-[13px] font-semibold text-text-secondary font-[inherit] cursor-pointer hover:bg-surface-secondary/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast.info(`${selectedPlatform.name} sync is not available yet.`);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-teal-deep text-white border-none text-[13px] font-semibold font-[inherit] cursor-pointer hover:bg-teal-deep/90"
                >
                  Save &amp; Sync
                </button>
              </footer>
            </aside>
          </>
        );
      })()}

      {/* ── CONNECT MODAL (template connect-box) ───────────────────────── */}
      {connectModalPlatform && (() => {
        const cm = CONNECT_MODAL_META[connectModalPlatform] ?? {
          bg: '#e8f5f3',
          color: '#007B5F',
          letter: '🔗',
          sub: `Securely link ${connectModalPlatform} to Kaivo for reporting and performance analysis.`,
        };
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
              role="presentation"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setConnectModalPlatform(null)}
            />
            <div
              className="relative bg-white rounded-2xl p-8 w-full max-w-[440px] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-teal-deep/15 via-transparent to-coral-light/15"
              />
              <div
                className="w-14 h-14 rounded-[14px] mx-auto mb-4 flex items-center justify-center text-[26px] font-bold"
                style={{ background: cm.bg, color: cm.color }}
              >
                {cm.letter}
              </div>
              <h3 className="text-[17px] font-bold text-text-primary text-center mb-1.5">
                Connect {connectModalPlatform}
              </h3>
              <p className="text-[13px] text-text-muted text-center leading-[1.5] mb-6 px-1">{cm.sub}</p>

              <div className="flex flex-col gap-2.5 mb-6">
                {CONNECT_MODAL_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-3 text-[12.5px] font-medium text-text-secondary">
                    <div className="w-[22px] h-[22px] rounded-full bg-teal-deep text-white flex items-center justify-center text-[11px] font-semibold shrink-0 shadow-[0_0_24px_rgba(0,123,95,0.25)]">
                      {i + 1}
                    </div>
                    {step}
                  </div>
                ))}
              </div>

              <div className="mb-5">
                <div className="text-[12px] font-semibold text-text-secondary mb-2">Historical data to load</div>
                <div className="flex flex-wrap gap-1.5">
                  {DATA_WINDOW_OPTS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setConnectDataWindow(opt)}
                      className={`px-3 py-1 rounded-md border border-border text-[11px] font-semibold font-[inherit] cursor-pointer transition-colors ${
                        connectDataWindow === opt
                          ? 'bg-teal-deep border-teal-deep text-white'
                          : 'bg-white border-border text-text-muted hover:border-aqua/40'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConnectModalPlatform(null)}
                  className="px-4 py-3 rounded-lg bg-white border border-border text-[13px] font-semibold text-text-secondary font-[inherit] cursor-pointer hover:bg-surface-secondary/60 shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConnectModalPlatform(null);
                    handleConnectTrigger(connectModalPlatform);
                  }}
                  className="flex-1 py-3 rounded-lg bg-teal-deep text-white border-none text-[13px] font-semibold font-[inherit] cursor-pointer hover:bg-teal-deep/90"
                >
                  Connect &amp; Authorise →
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
