'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaBMStatus, BMAccount, RedditAgencyStatus, SpotifyAgencyStatus } from '@/lib/api/contracts';
import { toast } from 'sonner';

type Step = 1 | 2 | 3 | 4;

const OAUTH_RETURN_KEY = 'kaivo_oauth_return_base';
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '1340998947829390';
const META_PENDING_CODE_KEY = 'kaivo_meta_oauth_code';
const REDDIT_CLIENT_ID = process.env.NEXT_PUBLIC_REDDIT_CLIENT_ID || '';
const REDDIT_REDIRECT_URI_OVERRIDE = process.env.NEXT_PUBLIC_REDDIT_REDIRECT_URI || '';
const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
const TIKTOK_CLIENT_KEY = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '';
const MICROSOFT_ADS_CLIENT_ID = process.env.NEXT_PUBLIC_MICROSOFT_ADS_CLIENT_ID || '';
const MICROSOFT_REDIRECT_URI_OVERRIDE = process.env.NEXT_PUBLIC_MICROSOFT_REDIRECT_URI || '';

type WirePlatformId = 'meta' | 'tiktok' | 'microsoft' | 'reddit' | 'spotify';

type PlatformCard = {
  id: WirePlatformId;
  name: string;
  icon: string;
  bg: string;
  color: string;
  /** Matches integrations `handleConnectTrigger` platform string */
  oauthName: string;
};

/** Only platforms with live OAuth + API in this app (see Integrations). */
const PLATFORM_CARDS: PlatformCard[] = [
  { id: 'meta', name: 'Meta Ads', icon: 'f', bg: '#e8effe', color: '#1877f2', oauthName: 'Meta' },
  { id: 'tiktok', name: 'TikTok Ads', icon: 'T', bg: '#e6f9fb', color: '#00b8c4', oauthName: 'TikTok' },
  { id: 'microsoft', name: 'Microsoft Ads', icon: 'M', bg: '#e8f0fe', color: '#0078d4', oauthName: 'Microsoft Ads' },
  { id: 'reddit', name: 'Reddit Ads', icon: 'r', bg: '#fff0ec', color: '#ff4500', oauthName: 'Reddit' },
  { id: 'spotify', name: 'Spotify Ads', icon: '♪', bg: '#e8f7ef', color: '#1db954', oauthName: 'Spotify' },
];

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

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

function getSpotifyRedirectUri() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/integrations/spotify/oauth/callback`;
  }
  return '/integrations/spotify/oauth/callback';
}

function getMicrosoftRedirectUri() {
  if (MICROSOFT_REDIRECT_URI_OVERRIDE.trim()) return MICROSOFT_REDIRECT_URI_OVERRIDE.trim();
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/integrations/microsoft/oauth/callback`;
  }
  return '/integrations/microsoft/oauth/callback';
}

function formatSpendMonthly(n: number): string {
  if (n == null || Number.isNaN(n) || n <= 0) return '—';
  return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)}/mo`;
}

type FetchedAccount = {
  key: string;
  platformId: WirePlatformId;
  name: string;
  spendLabel: string;
};

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { accessToken, agencyId } = useApiAuth();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.agencyRole !== 'agency_admin') {
      router.replace('/');
    }
  }, [session, status, router]);

  const [step, setStep] = useState<Step>(1);

  const [agencyName, setAgencyName] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('USD');

  const [metaStatus, setMetaStatus] = useState<MetaBMStatus | null>(null);
  const [tiktokStatus, setTiktokStatus] = useState<{ connected: boolean; connected_at: string | null; token_valid?: boolean } | null>(null);
  const [microsoftStatus, setMicrosoftStatus] = useState<{ connected: boolean; connected_at: string | null; token_valid?: boolean } | null>(null);
  const [redditStatus, setRedditStatus] = useState<RedditAgencyStatus | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyAgencyStatus | null>(null);

  const [connectingPlatformId, setConnectingPlatformId] = useState<string | null>(null);
  const [pendingMetaCode, setPendingMetaCode] = useState<string | null>(null);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [redditConnecting, setRedditConnecting] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [microsoftConnecting, setMicrosoftConnecting] = useState(false);

  const [fetchedAccounts, setFetchedAccounts] = useState<FetchedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [dataWindow, setDataWindow] = useState<'30d' | '90d' | '6mo' | '1yr'>('90d');

  const [syncProgress, setSyncProgress] = useState<Record<string, number>>({});
  const [syncComplete, setSyncComplete] = useState(false);

  /** True when user used "Skip for now" on Connect Platform (step 2). */
  const [skippedConnectStep, setSkippedConnectStep] = useState(false);

  useEffect(() => {
    if (session?.user?.name) setAgencyName(session.user.agencyName || session.user.name || '');
    if (session?.user?.email) setAgencyEmail(session.user.email || '');
  }, [session]);

  const fetchMetaStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    try {
      const data = await apiClient.get<MetaBMStatus>(API_ENDPOINTS.META.STATUS(agencyId), { accessToken, agencyId });
      setMetaStatus(data);
    } catch {
      setMetaStatus(null);
    }
  }, [accessToken, agencyId]);

  const fetchTiktokStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    try {
      const data = await apiClient.get<{ connected: boolean; connected_at: string | null; token_valid?: boolean }>(
        API_ENDPOINTS.TIKTOK.STATUS(agencyId),
        { accessToken, agencyId },
      );
      setTiktokStatus(data);
    } catch {
      setTiktokStatus(null);
    }
  }, [accessToken, agencyId]);

  const fetchMicrosoftStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    try {
      const data = await apiClient.get<{ connected: boolean; connected_at: string | null; token_valid?: boolean }>(
        API_ENDPOINTS.MICROSOFT.STATUS(agencyId),
        { accessToken, agencyId },
      );
      setMicrosoftStatus(data);
    } catch {
      setMicrosoftStatus(null);
    }
  }, [accessToken, agencyId]);

  const fetchRedditStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    try {
      const data = await apiClient.get<RedditAgencyStatus>(API_ENDPOINTS.REDDIT.STATUS(agencyId), { accessToken, agencyId });
      setRedditStatus(data);
    } catch {
      setRedditStatus(null);
    }
  }, [accessToken, agencyId]);

  const fetchSpotifyStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    try {
      const data = await apiClient.get<SpotifyAgencyStatus>(API_ENDPOINTS.SPOTIFY.STATUS(agencyId), { accessToken, agencyId });
      setSpotifyStatus(data);
    } catch {
      setSpotifyStatus(null);
    }
  }, [accessToken, agencyId]);

  const refreshAllStatuses = useCallback(async () => {
    await Promise.all([
      fetchMetaStatus(),
      fetchTiktokStatus(),
      fetchMicrosoftStatus(),
      fetchRedditStatus(),
      fetchSpotifyStatus(),
    ]);
  }, [fetchMetaStatus, fetchTiktokStatus, fetchMicrosoftStatus, fetchRedditStatus, fetchSpotifyStatus]);

  useEffect(() => {
    if (!accessToken || !agencyId) return;
    void refreshAllStatuses();
  }, [accessToken, agencyId, refreshAllStatuses]);

  useEffect(() => {
    if (step !== 2 || !accessToken || !agencyId) return;
    void refreshAllStatuses();
  }, [step, accessToken, agencyId, refreshAllStatuses]);

  const integratedById = useMemo(() => {
    const m: Record<string, boolean> = {
      meta: !!metaStatus?.connected,
      tiktok: !!tiktokStatus?.connected,
      microsoft: !!microsoftStatus?.connected,
      reddit: !!redditStatus?.connected,
      spotify: !!spotifyStatus?.connected,
    };
    return m;
  }, [metaStatus, tiktokStatus, microsoftStatus, redditStatus, spotifyStatus]);

  const integratedNames = useMemo(() => {
    return PLATFORM_CARDS.filter((p) => integratedById[p.id]).map((p) => p.name);
  }, [integratedById]);

  const hasAnyIntegration = integratedNames.length > 0;

  // ── Meta OAuth return (redirect URI must include /onboarding?meta_callback=1 in Meta app settings) ──
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
        const exactRedirectUri = `${window.location.origin}/onboarding?meta_callback=1`;
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
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(META_PENDING_CODE_KEY);
      }
    })();
  }, [pendingMetaCode, accessToken, agencyId, metaConnecting, fetchMetaStatus]);

  // ── TikTok OAuth return ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tiktok_callback') !== '1') return;
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (error) {
      const urlErr = new URL(window.location.href);
      urlErr.searchParams.delete('tiktok_callback');
      urlErr.searchParams.delete('code');
      urlErr.searchParams.delete('state');
      urlErr.searchParams.delete('error');
      urlErr.searchParams.delete('error_description');
      window.history.replaceState({}, '', urlErr.toString());
      toast.error(errorDescription || error || 'TikTok authorization failed');
      return;
    }

    if (!code || !accessToken || !agencyId) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('tiktok_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url.toString());

    (async () => {
      setConnectingPlatformId('tiktok');
      try {
        await apiClient.post(
          API_ENDPOINTS.TIKTOK.CONNECT(agencyId),
          { code, redirectUri: `${window.location.origin}/integrations/tiktok/oauth/callback`, state },
          { accessToken, agencyId },
        );
        toast.success('TikTok connected!');
        await fetchTiktokStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect TikTok'));
      } finally {
        setConnectingPlatformId(null);
      }
    })();
  }, [accessToken, agencyId, fetchTiktokStatus]);

  // ── Reddit ──
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
        await fetchRedditStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect Reddit'));
      } finally {
        setRedditConnecting(false);
      }
    })();
  }, [accessToken, agencyId, redditConnecting, fetchRedditStatus]);

  // ── Spotify ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify_callback') !== '1') return;
    const code = params.get('code');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    if (oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify_callback');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
      toast.error(oauthErrorDescription || oauthError || 'Spotify authorization failed');
      return;
    }

    if (!code || !accessToken || !agencyId || spotifyConnecting) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('spotify_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    (async () => {
      setSpotifyConnecting(true);
      try {
        const exactRedirectUri = getSpotifyRedirectUri();
        await apiClient.post(
          API_ENDPOINTS.SPOTIFY.CONNECT(agencyId),
          { code, redirectUri: exactRedirectUri },
          { accessToken, agencyId },
        );
        toast.success('Spotify connected!');
        await fetchSpotifyStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect Spotify'));
      } finally {
        setSpotifyConnecting(false);
      }
    })();
  }, [accessToken, agencyId, spotifyConnecting, fetchSpotifyStatus]);

  // ── Microsoft ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('microsoft_callback') !== '1') return;
    const code = params.get('code');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    if (oauthError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('microsoft_callback');
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      window.history.replaceState({}, '', url.toString());
      toast.error(oauthErrorDescription || oauthError || 'Microsoft authorization failed');
      return;
    }

    if (!code || !accessToken || !agencyId || microsoftConnecting) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('microsoft_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url.toString());

    (async () => {
      setMicrosoftConnecting(true);
      try {
        const exactRedirectUri = getMicrosoftRedirectUri();
        await apiClient.post(
          API_ENDPOINTS.MICROSOFT.CONNECT(agencyId),
          { code, redirectUri: exactRedirectUri },
          { accessToken, agencyId },
        );
        toast.success('Microsoft Ads connected!');
        await fetchMicrosoftStatus();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to connect Microsoft Ads'));
      } finally {
        setMicrosoftConnecting(false);
      }
    })();
  }, [accessToken, agencyId, microsoftConnecting, fetchMicrosoftStatus]);

  function setOauthReturnToOnboarding() {
    if (typeof window !== 'undefined') sessionStorage.setItem(OAUTH_RETURN_KEY, '/onboarding');
  }

  function startPlatformOAuth(oauthName: string) {
    if (typeof window === 'undefined') return;
    setOauthReturnToOnboarding();

    if (oauthName === 'Meta') {
      const redirectUri = `${window.location.origin}/onboarding?meta_callback=1`;
      const scopes = ['business_management', 'ads_management', 'ads_read'].join(',');
      const state = Math.random().toString(36).slice(2);
      window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
      return;
    }
    if (oauthName === 'Reddit') {
      if (!REDDIT_CLIENT_ID) {
        toast.error('Missing NEXT_PUBLIC_REDDIT_CLIENT_ID');
        return;
      }
      const redirectUri = getRedditRedirectUri();
      const state = Math.random().toString(36).slice(2);
      const scopes = 'adsread';
      window.location.href = `https://www.reddit.com/api/v1/authorize?client_id=${encodeURIComponent(REDDIT_CLIENT_ID)}&response_type=code&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}&duration=permanent&scope=${encodeURIComponent(scopes)}`;
      return;
    }
    if (oauthName === 'Spotify') {
      if (!SPOTIFY_CLIENT_ID) {
        toast.error('Missing NEXT_PUBLIC_SPOTIFY_CLIENT_ID');
        return;
      }
      const redirectUri = getSpotifyRedirectUri();
      const state = Math.random().toString(36).slice(2);
      const base = 'https://accounts.spotify.com/authorize';
      const params = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
      });
      window.location.href = `${base}?${params.toString()}`;
      return;
    }
    if (oauthName === 'TikTok') {
      if (!TIKTOK_CLIENT_KEY) {
        toast.error('Missing NEXT_PUBLIC_TIKTOK_CLIENT_KEY');
        return;
      }
      const redirectUri = `${window.location.origin}/integrations/tiktok/oauth/callback`;
      const state = Math.random().toString(36).slice(2);
      const scopes = ['user.info.basic'].join(',');
      const base = 'https://www.tiktok.com/v2/auth/authorize/';
      const params = new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        redirect_uri: redirectUri,
        scope: scopes,
        state,
        response_type: 'code',
      });
      window.location.href = `${base}?${params.toString()}`;
      return;
    }
    if (oauthName === 'Microsoft Ads') {
      if (!MICROSOFT_ADS_CLIENT_ID) {
        toast.error('Missing NEXT_PUBLIC_MICROSOFT_ADS_CLIENT_ID');
        return;
      }
      const redirectUri = getMicrosoftRedirectUri();
      const state = Math.random().toString(36).slice(2);
      const scope = encodeURIComponent('https://ads.microsoft.com/msads.manage offline_access');
      const encodedRedirect = encodeURIComponent(redirectUri);
      window.location.href =
        `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(MICROSOFT_ADS_CLIENT_ID)}&response_type=code&redirect_uri=${encodedRedirect}&response_mode=query&scope=${scope}&state=${encodeURIComponent(state)}`;
      return;
    }
    toast.info(`${oauthName} integration is not available from onboarding yet. Use Integrations.`);
  }

  async function handleConnectCard(p: PlatformCard) {
    if (!accessToken || !agencyId) {
      toast.error('Sign in again to connect a platform.');
      return;
    }
    setConnectingPlatformId(p.id);
    try {
      startPlatformOAuth(p.oauthName);
    } finally {
      // OAuth navigates away; if something fails before navigation, clear
      setTimeout(() => setConnectingPlatformId((cur) => (cur === p.id ? null : cur)), 500);
    }
  }

  async function handleDisconnectCard(p: PlatformCard) {
    if (!accessToken || !agencyId) return;
    if (!window.confirm(`Disconnect ${p.name}?`)) return;
    setConnectingPlatformId(p.id);
    try {
      const ep =
        p.id === 'meta'
          ? API_ENDPOINTS.META.DISCONNECT(agencyId)
          : p.id === 'tiktok'
            ? API_ENDPOINTS.TIKTOK.DISCONNECT(agencyId)
            : p.id === 'microsoft'
              ? API_ENDPOINTS.MICROSOFT.DISCONNECT(agencyId)
              : p.id === 'reddit'
                ? API_ENDPOINTS.REDDIT.DISCONNECT(agencyId)
                : API_ENDPOINTS.SPOTIFY.DISCONNECT(agencyId);
      await apiClient.post(ep, {}, { accessToken, agencyId });
      toast.success(`${p.name} disconnected`);
      await refreshAllStatuses();
      setFetchedAccounts((prev) => prev.filter((a) => a.platformId !== p.id));
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        prev.forEach((k) => {
          if (k.startsWith(`${p.id}:`)) next.delete(k);
        });
        return next;
      });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to disconnect'));
    } finally {
      setConnectingPlatformId(null);
    }
  }

  const loadAccountsForStep3 = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setAccountsLoading(true);
    const rows: FetchedAccount[] = [];
    const add = (platformId: WirePlatformId, accounts: BMAccount[]) => {
      for (const a of accounts) {
        rows.push({
          key: `${platformId}:${a.account_id}`,
          platformId,
          name: a.account_name || a.account_id,
          spendLabel: formatSpendMonthly(a.spend ?? 0),
        });
      }
    };

    try {
      const tasks: Promise<void>[] = [];

      if (metaStatus?.connected) {
        tasks.push(
          apiClient
            .get<{ accounts?: BMAccount[] }>(API_ENDPOINTS.META.ACCOUNTS(agencyId), { accessToken, agencyId })
            .then((d) => add('meta', d.accounts || []))
            .catch(() => {}),
        );
      }
      if (tiktokStatus?.connected) {
        tasks.push(
          apiClient
            .get<{ accounts?: BMAccount[] }>(API_ENDPOINTS.TIKTOK.ACCOUNTS(agencyId), { accessToken, agencyId })
            .then((d) => add('tiktok', d.accounts || []))
            .catch(() => {}),
        );
      }
      if (microsoftStatus?.connected) {
        tasks.push(
          apiClient
            .get<{ accounts?: BMAccount[] }>(API_ENDPOINTS.MICROSOFT.ACCOUNTS(agencyId), { accessToken, agencyId })
            .then((d) => add('microsoft', d.accounts || []))
            .catch(() => {}),
        );
      }
      if (redditStatus?.connected) {
        tasks.push(
          apiClient
            .get<{ accounts?: BMAccount[] }>(API_ENDPOINTS.REDDIT.ACCOUNTS(agencyId), { accessToken, agencyId })
            .then((d) => add('reddit', d.accounts || []))
            .catch(() => {}),
        );
      }
      if (spotifyStatus?.connected) {
        tasks.push(
          apiClient
            .get<{ accounts?: BMAccount[] }>(API_ENDPOINTS.SPOTIFY.ACCOUNTS(agencyId), { accessToken, agencyId })
            .then((d) => add('spotify', d.accounts || []))
            .catch(() => {}),
        );
      }

      await Promise.all(tasks);
      setFetchedAccounts(rows);
    } finally {
      setAccountsLoading(false);
    }
  }, [
    accessToken,
    agencyId,
    metaStatus?.connected,
    tiktokStatus?.connected,
    microsoftStatus?.connected,
    redditStatus?.connected,
    spotifyStatus?.connected,
  ]);

  useEffect(() => {
    if (step !== 3) return;
    void loadAccountsForStep3();
  }, [step, loadAccountsForStep3]);

  async function handleSaveProfile() {
    if (!agencyName.trim()) {
      toast.error('Please enter your agency name.');
      return;
    }
    if (accessToken && agencyId) {
      try {
        await apiClient.patch(
          API_ENDPOINTS.AGENCY.UPDATE(agencyId),
          {
            name: agencyName.trim(),
            email: agencyEmail.trim() || undefined,
            timezone,
            currency,
          },
          { accessToken, agencyId },
        );
      } catch {
        // non-blocking
      }
    }
    setStep(2);
  }

  function goStep2Continue() {
    setSkippedConnectStep(false);
    setStep(3);
  }

  function goStep2Skip() {
    setSkippedConnectStep(true);
    setSelectedAccounts(new Set());
    setStep(3);
  }

  function toggleAccount(accountKey: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountKey)) next.delete(accountKey);
      else next.add(accountKey);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedAccounts.size === fetchedAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(fetchedAccounts.map((a) => a.key)));
    }
  }

  const canSkipStep3 = skippedConnectStep || fetchedAccounts.length === 0;

  function skipStep3ToFinish() {
    setSelectedAccounts(new Set());
    setStep(4);
    setSyncComplete(true);
  }

  function startSync() {
    setStep(4);
    const accountIds = Array.from(selectedAccounts);
    if (accountIds.length === 0) {
      setSyncComplete(true);
      return;
    }
    const progress: Record<string, number> = {};
    accountIds.forEach((id) => {
      progress[id] = 0;
    });
    setSyncProgress({ ...progress });

    accountIds.forEach((id, idx) => {
      const duration = 2000 + idx * 600 + Math.random() * 1000;
      const steps = 20;
      const interval = duration / steps;
      let current = 0;

      const timer = setInterval(() => {
        current++;
        setSyncProgress((prev) => ({ ...prev, [id]: Math.min(100, Math.round((current / steps) * 100)) }));
        if (current >= steps) {
          clearInterval(timer);
          setSyncProgress((prev) => {
            const updated = { ...prev, [id]: 100 };
            if (Object.values(updated).every((v) => v >= 100)) {
              setTimeout(() => setSyncComplete(true), 500);
            }
            return updated;
          });
        }
      }, interval);
    });
  }

  function handleFinish() {
    router.push('/');
  }

  const stepLabels = ['Agency Profile', 'Connect Platform', 'Select Clients', 'All Set'];

  return (
    <div className="h-full min-h-0 bg-cream flex flex-col">
      <div className="shrink-0 bg-white border-b border-border-subtle px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none">
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.125 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.70 68.17 26.78 C83.56 16.94 97.70 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FF7043" transform="translate(71,0)" />
          </svg>
          <span className="text-[16px] font-bold text-text-primary tracking-[0.18em]">KAIVO</span>
        </div>
        <button type="button" onClick={() => router.push('/')} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
          Need help? Contact support →
        </button>
      </div>

      <div className="shrink-0 bg-white border-b border-border-subtle px-8 py-3">
        <div className="max-w-[700px] mx-auto flex items-center gap-1">
          {stepLabels.map((label, i) => {
            const s = (i + 1) as Step;
            const isActive = step === s;
            const isDone = step > s;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isDone ? 'bg-teal-deep text-white' : isActive ? 'bg-teal-deep text-white' : 'bg-surface-secondary text-text-muted'
                  }`}
                >
                  {isDone ? '✓' : s}
                </div>
                <span className={`text-[12px] font-semibold whitespace-nowrap ${isActive ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
                {i < 3 && <div className={`flex-1 h-[2px] mx-2 rounded-full ${step > s ? 'bg-teal-deep' : 'bg-surface-secondary'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-center pt-10 pb-20 px-6 min-h-min">
        <div className="w-full max-w-[640px]">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Set up your agency</h2>
                <p className="text-[14px] text-text-muted mt-1">Tell us about your agency. This takes less than a minute and you can change everything later in Settings.</p>
              </div>

              <div className="bg-white rounded-xl border border-border p-6 space-y-5">
                <div className="flex items-center gap-5">
                  <div className="w-[64px] h-[64px] rounded-full bg-surface-secondary border border-border flex items-center justify-center text-text-muted text-[20px] shrink-0 cursor-pointer hover:bg-surface-hover transition-colors">
                    📷
                  </div>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold text-text-primary mb-[6px]">Agency Logo</div>
                    <div className="text-[11.5px] text-text-muted">Optional — you can add this later. Used in the client portal.</div>
                  </div>
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Agency Name *</label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Your Agency Name"
                    className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep/20"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Contact Email</label>
                  <input
                    type="email"
                    value={agencyEmail}
                    onChange={(e) => setAgencyEmail(e.target.value)}
                    placeholder="hello@agency.com"
                    className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary focus:outline-none focus:border-teal-deep"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary focus:outline-none focus:border-teal-deep"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Connect your first platform</h2>
              </div>

              <div
                className={`rounded-xl border px-4 py-3 ${
                  hasAnyIntegration ? 'border-teal/30 bg-teal-light/40' : 'border-border bg-white'
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-1">Integrated platforms</p>
                {hasAnyIntegration ? (
                  <p className="text-[13px] font-semibold text-text-primary">{integratedNames.join(' · ')}</p>
                ) : (
                  <p className="text-[13px] text-text-muted">None yet — connect below or skip and use Integrations later.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {PLATFORM_CARDS.map((p) => {
                  const isConnected = integratedById[p.id];
                  const busy =
                    connectingPlatformId === p.id ||
                    (p.id === 'meta' && metaConnecting) ||
                    (p.id === 'reddit' && redditConnecting) ||
                    (p.id === 'spotify' && spotifyConnecting) ||
                    (p.id === 'microsoft' && microsoftConnecting);
                  return (
                    <div key={p.id} className={`bg-white rounded-xl border p-5 transition-colors ${isConnected ? 'border-teal' : 'border-border'}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-[40px] h-[40px] rounded-lg flex items-center justify-center text-[15px] font-semibold shrink-0"
                          style={{ background: p.bg, color: p.color }}
                        >
                          {p.icon}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-text-primary">{p.name}</div>
                          {isConnected ? (
                            <span className="text-[10.5px] font-semibold text-green">● Connected</span>
                          ) : (
                            <span className="text-[10.5px] font-semibold text-text-muted">Not connected</span>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          type="button"
                          onClick={() => void handleDisconnectCard(p)}
                          disabled={!!busy}
                          className="w-full h-[36px] border border-border rounded-lg text-[12px] font-semibold text-text-muted hover:border-coral hover:text-coral transition-colors disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleConnectCard(p)}
                          disabled={!!busy}
                          className="w-full h-[36px] bg-teal-deep text-white rounded-lg text-[12px] font-semibold hover:bg-teal-deep/90 transition-colors disabled:opacity-60"
                        >
                          {busy ? (
                            <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="text-[13px] font-semibold text-text-muted hover:text-text-primary">
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={goStep2Skip} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={goStep2Continue}
                    disabled={!hasAnyIntegration}
                    className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Select your clients</h2>
                <p className="text-[14px] text-text-muted mt-1">
                  Ad accounts from your connected platforms. Choose which to include now; you can manage assignments anytime in Client Manager.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-text-primary">
                    {accountsLoading ? 'Loading accounts…' : `${fetchedAccounts.length} account${fetchedAccounts.length === 1 ? '' : 's'} found`}
                  </span>
                  {!accountsLoading && fetchedAccounts.length > 0 && (
                    <button type="button" onClick={handleSelectAll} className="text-[12px] font-semibold text-teal-deep hover:underline">
                      {selectedAccounts.size === fetchedAccounts.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                {accountsLoading ? (
                  <div className="p-8 text-center text-text-muted text-[13px]">Fetching accounts from connected platforms…</div>
                ) : fetchedAccounts.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-[13px]">
                    {skippedConnectStep
                      ? 'You skipped connecting platforms. Connect anytime under Integrations, then assign accounts in Client Manager.'
                      : 'No ad accounts returned yet. Try refreshing after your platform finishes syncing, or continue to the dashboard.'}
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {fetchedAccounts.map((acc) => {
                      const isSelected = selectedAccounts.has(acc.key);
                      const plat = PLATFORM_CARDS.find((c) => c.id === acc.platformId);
                      return (
                        <label key={acc.key} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-secondary/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAccount(acc.key)}
                            className="w-4 h-4 rounded border-border text-teal-deep focus:ring-teal-deep accent-teal-deep"
                          />
                          <div
                            className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0"
                            style={{ background: plat?.bg, color: plat?.color }}
                          >
                            {plat?.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-semibold text-text-primary truncate">{acc.name}</div>
                            <div className="text-[11px] text-text-muted">{plat?.name}</div>
                          </div>
                          <span className="text-[11.5px] font-semibold text-text-muted font-mono">{acc.spendLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Historical Data</label>
                <div className="flex gap-2">
                  {(['30d', '90d', '6mo', '1yr'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDataWindow(w)}
                      className={`px-4 h-[36px] rounded-lg text-[12px] font-semibold transition-colors ${
                        dataWindow === w ? 'bg-teal-deep text-white' : 'bg-surface-secondary text-text-muted border border-border hover:bg-surface-hover'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between flex-wrap gap-3">
                <button type="button" onClick={() => setStep(2)} className="text-[13px] font-semibold text-text-muted hover:text-text-primary">
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  {canSkipStep3 && (
                    <button type="button" onClick={skipStep3ToFinish} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
                      Skip for now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={startSync}
                    disabled={selectedAccounts.size === 0 && fetchedAccounts.length > 0}
                    className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors disabled:opacity-50"
                  >
                    {selectedAccounts.size === 0 && fetchedAccounts.length === 0 ? 'Continue' : 'Start Syncing'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {!syncComplete ? (
                <>
                  <div>
                    <h2 className="text-[24px] font-bold text-text-primary">Pulling your data...</h2>
                    <p className="text-[14px] text-text-muted mt-1">
                      Kaivo is connecting to your ad platforms and loading campaign history. You can leave this page and we&apos;ll keep syncing in the background.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-border p-5 space-y-4">
                    {Array.from(selectedAccounts).map((accKey) => {
                      const acc = fetchedAccounts.find((a) => a.key === accKey);
                      const prog = syncProgress[accKey] || 0;
                      const plat = PLATFORM_CARDS.find((c) => c.id === acc?.platformId);
                      return (
                        <div key={accKey} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[9px] font-semibold"
                                style={{ background: plat?.bg, color: plat?.color }}
                              >
                                {plat?.icon}
                              </div>
                              <span className="text-[12.5px] font-semibold text-text-primary">{acc?.name}</span>
                            </div>
                            <span className="text-[11px] font-semibold text-text-muted font-mono">{prog}%</span>
                          </div>
                          <div className="w-full h-[6px] bg-surface-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-teal-deep transition-all duration-300" style={{ width: `${prog}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 space-y-6">
                  <div className="w-[72px] h-[72px] rounded-full bg-teal-light flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-teal-deep" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[28px] font-bold text-text-primary">You&apos;re all set!</h2>
                    <p className="text-[14px] text-text-muted mt-2 max-w-[400px] mx-auto">
                      {selectedAccounts.size === 0
                        ? 'You can connect platforms and assign ad accounts anytime from Integrations and Client Manager.'
                        : 'Kaivo has pulled your connected ad accounts and started preparing your workspace. Your dashboard is ready.'}
                    </p>
                  </div>
                  <div className="flex gap-6 justify-center text-center flex-wrap">
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{integratedNames.length || Object.values(integratedById).filter(Boolean).length}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">Platforms</div>
                    </div>
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{selectedAccounts.size}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">Accounts</div>
                    </div>
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{dataWindow}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">History</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleFinish}
                    className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[14px] h-[48px] px-10 rounded-[10px] transition-colors"
                  >
                    Go to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
