'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { useClients, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaBMStatus, BMAccount, Client } from '@/lib/api/contracts';
import { MOCK_PLATFORMS } from '@/lib/mock/dashboard';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '1340998947829390';

// ── Helper components ───────────────────────────────────────────────────────

function platformStatusBadgeClass(status: string) {
  if (status === 'connected') return 'bg-green-light text-green';
  if (status === 'disconnected') return 'bg-amber-light text-amber';
  return 'bg-cream text-text-muted';
}

function platformStatusLabel(status: string) {
  if (status === 'connected') return 'Connected';
  if (status === 'disconnected') return 'Disconnected';
  return 'Not connected';
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: session } = useSession();
  const { accessToken, agencyId } = useApiAuth();
  const { clients } = useClients();
  const isAdmin = session?.user?.agencyRole === 'agency_admin';

  // Meta BM state
  const [metaStatus, setMetaStatus] = useState<MetaBMStatus | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [metaAutoLinking, setMetaAutoLinking] = useState(false);

  // BM Accounts panel
  const [showAccountsPanel, setShowAccountsPanel] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [bmAccounts, setBmAccounts] = useState<BMAccount[]>([]);
  const [bmAccountsLoading, setBmAccountsLoading] = useState(false);
  const [linkingClientId, setLinkingClientId] = useState<number | null>(null);
  const [selectedAccountForLink, setSelectedAccountForLink] = useState<string>('');

  // Generic platform panel (for non-meta platforms)
  const [panelPlatform, setPanelPlatform] = useState<string | null>(null);

  // ── Fetch Meta status ──────────────────────────────────────────────────
  const fetchMetaStatus = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setMetaLoading(true);
    try {
      const data = await apiClient.get<MetaBMStatus>(
        API_ENDPOINTS.META.STATUS(agencyId),
        { accessToken, agencyId },
      );
      setMetaStatus(data);
    } catch {
      setMetaStatus(null);
    } finally {
      setMetaLoading(false);
    }
  }, [accessToken, agencyId]);

  useEffect(() => { fetchMetaStatus(); }, [fetchMetaStatus]);

  // ── Handle OAuth callback ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_callback') !== '1') return;
    const code = params.get('code');
    // Wait until auth is initialized
    if (!code || !accessToken || !agencyId) return;
    // Don't fire twice
    if (metaConnecting) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('meta_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    (async () => {
      setMetaConnecting(true);
      try {
        const exactRedirectUri = `${window.location.origin}/integrations?meta_callback=1`;
        await apiClient.post(
          API_ENDPOINTS.META.CONNECT(agencyId),
          { code, redirectUri: exactRedirectUri },
          { accessToken, agencyId },
        );
        toast.success('Meta Business Manager connected!');
        fetchMetaStatus();
      } catch (err: unknown) {
        const msg = typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to connect Meta Business Manager';
        toast.error(msg);
      } finally {
        setMetaConnecting(false);
      }
    })();
  }, [accessToken, agencyId]);

  // ── Fetch BM accounts ─────────────────────────────────────────────────
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

  // ── Panel animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!showAccountsPanel && !panelPlatform) {
      setPanelEntered(false);
      return;
    }
    setPanelEntered(false);
    const id = window.requestAnimationFrame(() => setPanelEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [showAccountsPanel, panelPlatform]);

  // ── Actions ───────────────────────────────────────────────────────────
  const handleConnect = () => {
    const redirectUri = `${window.location.origin}/integrations?meta_callback=1`;
    const scopes = ['business_management', 'ads_management', 'ads_read'].join(',');
    const state = Math.random().toString(36).slice(2);
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  };

  const handleDisconnect = async () => {
    if (!accessToken || !agencyId) return;
    if (!window.confirm('Disconnect Meta Business Manager? All client ad account links will be reset.')) return;
    try {
      await apiClient.post(API_ENDPOINTS.META.DISCONNECT(agencyId), {}, { accessToken, agencyId });
      toast.success('Meta Business Manager disconnected');
      setMetaStatus(null);
      setBmAccounts([]);
      fetchMetaStatus();
    } catch (err: unknown) {
      toast.error(typeof err === 'object' && err !== null && 'message' in err
        ? (err as { message: string }).message : 'Failed to disconnect');
    }
  };

  const handleAutoLink = async () => {
    if (!accessToken || !agencyId) return;
    setMetaAutoLinking(true);
    try {
      const result = await apiClient.post<{ matched: number; not_linked: number; total: number }>(
        API_ENDPOINTS.META.AUTO_LINK(agencyId), {}, { accessToken, agencyId },
      );
      toast.success(`Auto-link: ${result.matched} matched, ${result.not_linked} unlinked of ${result.total} clients`);
      fetchMetaStatus();
      if (showAccountsPanel) fetchBmAccounts();
    } catch (err: unknown) {
      toast.error(typeof err === 'object' && err !== null && 'message' in err
        ? (err as { message: string }).message : 'Auto-link failed');
    } finally {
      setMetaAutoLinking(false);
    }
  };

  const handleManualLink = async (clientId: number, adAccountId: string) => {
    if (!accessToken || !agencyId) return;
    setLinkingClientId(clientId);
    try {
      await apiClient.post(
        API_ENDPOINTS.META.MANUAL_LINK(String(clientId)),
        { ad_account_id: adAccountId },
        { accessToken, agencyId },
      );
      toast.success('Client linked to ad account');
      fetchBmAccounts();
    } catch (err: unknown) {
      toast.error(typeof err === 'object' && err !== null && 'message' in err
        ? (err as { message: string }).message : 'Link failed');
    } finally {
      setLinkingClientId(null);
      setSelectedAccountForLink('');
    }
  };

  const handleOpenAccountsPanel = () => {
    setShowAccountsPanel(true);
    setPanelPlatform(null);
    fetchBmAccounts();
  };

  // ── Derived state ─────────────────────────────────────────────────────
  const connected = metaStatus?.connected ?? false;
  const tokenExpired = connected && !metaStatus?.token_valid;
  const tokenWarning = metaStatus?.token_warning ?? false;

  const linkedCount = useMemo(
    () => bmAccounts.filter((a) => a.linked_client_id != null).length,
    [bmAccounts],
  );

  const unlinkedClients = useMemo(() => {
    const linkedClientIds = new Set(
      bmAccounts.filter((a) => a.linked_client_id != null).map((a) => Number(a.linked_client_id)),
    );
    return clients.filter((c) => !linkedClientIds.has(c.id));
  }, [clients, bmAccounts]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 bg-cream">
      <DashboardHeader title="Integrations" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">

          {/* ── META BUSINESS MANAGER CARD ──────────────────────────── */}
          <section className="bg-white rounded-xl border-2 border-cream-border overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b-2 border-cream-border flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#e8effe', color: '#1877f2' }}
                >
                  <MetaIcon />
                </div>
                <div>
                  <h2 className="text-[14px] font-extrabold text-text-primary">
                    Meta Business Manager
                  </h2>
                  <p className="text-[12px] text-text-muted font-medium mt-0.5">
                    {connected
                      ? `Connected to ${metaStatus?.business_manager_name ?? 'Business Manager'}`
                      : 'Connect to manage all client ad accounts from one place'}
                  </p>
                </div>
              </div>

              {metaLoading ? (
                <div className="w-20 h-6 bg-cream-dark rounded animate-pulse" />
              ) : (
                <span
                  className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    connected && !tokenExpired
                      ? 'bg-green-light text-green'
                      : connected && tokenExpired
                        ? 'bg-red-light text-red'
                        : 'bg-cream text-text-muted'
                  }`}
                >
                  {connected && !tokenExpired
                    ? 'Connected'
                    : connected && tokenExpired
                      ? 'Token Expired'
                      : 'Not Connected'}
                </span>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Token warnings */}
              {connected && tokenWarning && !tokenExpired && (
                <div className="rounded-lg bg-amber-light/50 border border-amber/20 px-4 py-3 flex items-start gap-2">
                  <span className="text-amber text-[14px] leading-none mt-0.5">⚠</span>
                  <p className="text-[12px] font-bold text-amber">
                    Token expires {formatDate(metaStatus?.token_expires_at)}.
                    Reconnect to refresh your access.
                  </p>
                </div>
              )}
              {tokenExpired && (
                <div className="rounded-lg bg-red-light/50 border border-red/20 px-4 py-3 flex items-start gap-2">
                  <span className="text-red text-[14px] leading-none mt-0.5">✕</span>
                  <p className="text-[12px] font-bold text-red">
                    Your Meta access token has expired. Reconnect to continue syncing.
                  </p>
                </div>
              )}

              {/* Status details when connected */}
              {connected && !tokenExpired && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'BM ID', value: metaStatus?.business_manager_id || '—' },
                    { label: 'Connected', value: formatDate(metaStatus?.connected_at) },
                    { label: 'Token Status', value: '✓ Valid', color: 'text-green' },
                    { label: 'Expires', value: formatDate(metaStatus?.token_expires_at) },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-lg border-2 border-cream-border bg-cream/40 px-3 py-2.5">
                      <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">{kpi.label}</div>
                      <div className={`text-[13px] font-bold mt-1 ${'color' in kpi && kpi.color ? kpi.color : 'text-text-primary'}`}>
                        {kpi.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* How it works (when disconnected) */}
              {!connected && !metaLoading && (
                <div className="rounded-lg bg-cream/60 border-2 border-cream-border p-4">
                  <p className="text-[12px] text-text-secondary leading-relaxed">
                    <span className="font-bold text-text-primary">How it works:</span>{' '}
                    Connect your Meta Business Manager to automatically see all client ad
                    accounts. Use <span className="font-bold">Auto-link</span> to match
                    clients with their accounts, or assign manually from the accounts
                    panel.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-3">
                  {!connected && (
                    <button
                      id="meta-connect-btn"
                      type="button"
                      className="bg-[#1877f2] text-white font-bold rounded-[10px] h-[40px] px-5 inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-95 transition-opacity"
                      onClick={handleConnect}
                      disabled={metaConnecting || metaLoading}
                    >
                      {metaConnecting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <MetaIcon className="w-4 h-4" />
                          Connect Meta Business Manager
                        </>
                      )}
                    </button>
                  )}

                  {connected && tokenExpired && (
                    <button
                      type="button"
                      className="bg-[#1877f2] text-white font-bold rounded-[10px] h-[40px] px-5 inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
                      onClick={handleConnect}
                    >
                      🔄 Reconnect
                    </button>
                  )}

                  {connected && !tokenExpired && (
                    <>
                      <button
                        id="meta-manage-accounts-btn"
                        type="button"
                        className="bg-teal text-white font-bold rounded-[10px] h-[40px] px-5 inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
                        onClick={handleOpenAccountsPanel}
                      >
                        Manage Accounts
                      </button>

                      <button
                        id="meta-auto-link-btn"
                        type="button"
                        className="bg-[#1877f2] text-white font-bold rounded-[10px] h-[40px] px-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-95 transition-opacity"
                        onClick={handleAutoLink}
                        disabled={metaAutoLinking}
                      >
                        {metaAutoLinking ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Auto-linking…
                          </>
                        ) : (
                          '⚡ Auto-link Clients'
                        )}
                      </button>

                      <button
                        type="button"
                        className="bg-cream border-2 border-cream-border text-text-primary font-bold rounded-[10px] h-[40px] px-4 inline-flex items-center justify-center gap-2 hover:bg-cream-dark transition-colors"
                        onClick={handleConnect}
                      >
                        🔄 Reconnect
                      </button>

                      <button
                        type="button"
                        className="text-[13px] font-bold text-red hover:underline ml-2"
                        onClick={handleDisconnect}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              )}

              {!isAdmin && !connected && (
                <p className="text-[12px] text-text-muted">
                  Ask your agency admin to connect Meta Business Manager.
                </p>
              )}
            </div>
          </section>

          {/* ── OTHER PLATFORM CARDS ────────────────────────────────── */}
          <section>
            <h2 className="text-[13px] font-bold text-text-primary mb-3">Other Platforms</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MOCK_PLATFORMS.filter((p) => !p.name.toLowerCase().includes('meta')).map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border-2 border-cream-border p-4 flex flex-col gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-[15px] font-extrabold shrink-0"
                      style={{ backgroundColor: p.iconBg, color: p.iconColor }}
                    >
                      {p.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-text-primary truncate">{p.name}</div>
                      <span
                        className={`inline-flex mt-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold ${platformStatusBadgeClass(p.status)}`}
                      >
                        {platformStatusLabel(p.status)}
                      </span>
                    </div>
                  </div>
                  <div className="text-[12px] text-text-secondary">
                    <span className="font-bold text-text-primary">{p.accounts}</span>{' '}
                    {p.accounts === 1 ? 'account' : 'accounts'}
                    <span className="text-text-muted mx-1.5">·</span>
                    <span className="font-mono font-bold text-text-primary">{p.spend}</span>
                    <span className="text-text-muted"> spend</span>
                  </div>
                  {p.status === 'connected' && p.score > 0 && (
                    <div className="text-[12px]">
                      <span className="text-text-muted font-medium">Score </span>
                      <span className="font-mono font-bold text-teal">{p.score}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-text-muted font-medium">
                    Last synced: <span className="text-text-secondary">{p.lastSynced}</span>
                  </div>
                  <div className="pt-1 mt-auto">
                    {p.status === 'connected' ? (
                      <button
                        type="button"
                        onClick={() => { setPanelPlatform(p.id); setShowAccountsPanel(false); }}
                        className="w-full text-center text-[12px] font-bold py-2 rounded-lg bg-cream border-2 border-cream-border text-text-primary hover:bg-cream-dark transition-colors"
                      >
                        Manage
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-center text-[12px] font-bold py-2 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* ── META ACCOUNTS SLIDING PANEL ──────────────────────────────── */}
      {showAccountsPanel && (
        <>
          <div
            role="presentation"
            className="fixed inset-0 bg-black/30 z-50 cursor-pointer"
            onClick={() => setShowAccountsPanel(false)}
          />
          <aside
            className={`fixed top-0 right-0 z-[60] h-full w-[440px] max-w-[100vw] bg-white shadow-xl flex flex-col border-l-2 border-cream-border transition-transform duration-300 ease-out ${
              panelEntered ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Panel header */}
            <div className="h-[56px] px-5 flex items-center justify-between border-b-2 border-cream-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MetaIcon className="w-5 h-5 text-[#1877f2] shrink-0" />
                <h3 className="text-[15px] font-extrabold text-text-primary truncate pr-2">
                  Ad Account Mapping
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountsPanel(false)}
                className="w-9 h-9 rounded-lg border-2 border-cream-border bg-cream text-text-primary text-[18px] font-bold leading-none flex items-center justify-center hover:bg-cream-dark transition-colors shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border-2 border-cream-border bg-cream/40 p-2.5 text-center">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">Accounts</div>
                  <div className="text-[18px] font-extrabold text-text-primary font-mono">{bmAccounts.length}</div>
                </div>
                <div className="rounded-lg border-2 border-cream-border bg-cream/40 p-2.5 text-center">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">Linked</div>
                  <div className="text-[18px] font-extrabold text-green font-mono">{linkedCount}</div>
                </div>
                <div className="rounded-lg border-2 border-cream-border bg-cream/40 p-2.5 text-center">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">Unlinked</div>
                  <div className="text-[18px] font-extrabold text-amber font-mono">{bmAccounts.length - linkedCount}</div>
                </div>
              </div>

              {bmAccountsLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-cream-dark rounded-xl" />
                  ))}
                </div>
              ) : bmAccounts.length === 0 ? (
                <p className="text-[13px] text-text-muted font-medium py-4 text-center">
                  No ad accounts found in your Business Manager.
                </p>
              ) : (
                <ul className="space-y-3">
                  {bmAccounts.map((acc) => {
                    const linkedClient = acc.linked_client_id
                      ? clients.find((c) => c.id === Number(acc.linked_client_id))
                      : null;
                    const statusColor = acc.status === 'ACTIVE' ? 'bg-green' : acc.status === 'DISABLED' ? 'bg-red' : 'bg-amber';

                    return (
                      <li
                        key={acc.account_id}
                        className="rounded-xl border-2 border-cream-border bg-white p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                              <span className="text-[13px] font-bold text-text-primary truncate">
                                {acc.account_name}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-muted font-mono mt-0.5 pl-4">
                              {acc.account_id} · {acc.currency}
                            </p>
                          </div>
                          {acc.spend > 0 && (
                            <span className="text-[11px] font-mono font-bold text-text-primary shrink-0">
                              ${acc.spend.toLocaleString()}
                            </span>
                          )}
                        </div>

                        {linkedClient ? (
                          <div className="flex items-center gap-2 pl-4">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-green-light text-green">
                              Linked
                            </span>
                            <span className="text-[11px] font-bold text-text-secondary">
                              → {linkedClient.name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pl-4">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-light text-amber">
                              Unlinked
                            </span>
                            {isAdmin && unlinkedClients.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <select
                                  className="flex-1 min-w-0 h-7 px-2 text-[11px] border-2 border-cream-border rounded-md bg-cream focus:outline-none focus:border-teal"
                                  value={linkingClientId === null ? '' : (selectedAccountForLink === acc.account_id ? String(linkingClientId) : '')}
                                  onChange={(e) => {
                                    const cid = Number(e.target.value);
                                    if (cid) {
                                      setSelectedAccountForLink(acc.account_id);
                                      handleManualLink(cid, acc.account_id);
                                    }
                                  }}
                                  disabled={linkingClientId !== null}
                                >
                                  <option value="">Assign to client…</option>
                                  {unlinkedClients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                {linkingClientId !== null && selectedAccountForLink === acc.account_id && (
                                  <span className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin shrink-0" />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Panel footer */}
            <div className="p-5 border-t-2 border-cream-border shrink-0 flex gap-3">
              <button
                type="button"
                className="flex-1 text-center text-[12px] font-bold py-2.5 rounded-lg bg-[#1877f2] text-white hover:opacity-95 transition-opacity disabled:opacity-50"
                onClick={handleAutoLink}
                disabled={metaAutoLinking}
              >
                {metaAutoLinking ? 'Auto-linking…' : '⚡ Auto-link All'}
              </button>
              <button
                type="button"
                className="flex-1 text-center text-[12px] font-bold py-2.5 rounded-lg bg-cream border-2 border-cream-border text-text-primary hover:bg-cream-dark transition-colors"
                onClick={fetchBmAccounts}
                disabled={bmAccountsLoading}
              >
                🔄 Refresh
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── GENERIC PLATFORM PANEL (non-Meta) ────────────────────────── */}
      {panelPlatform && (() => {
        const selectedPlatform = MOCK_PLATFORMS.find((p) => p.id === panelPlatform);
        if (!selectedPlatform) return null;
        return (
          <>
            <div
              role="presentation"
              className="fixed inset-0 bg-black/30 z-50 cursor-pointer"
              onClick={() => setPanelPlatform(null)}
            />
            <aside
              className={`fixed top-0 right-0 z-[60] h-full w-[400px] max-w-[100vw] bg-white shadow-xl flex flex-col border-l-2 border-cream-border transition-transform duration-300 ease-out ${
                panelEntered ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="h-[56px] px-5 flex items-center justify-between border-b-2 border-cream-border shrink-0">
                <h3 className="text-[15px] font-extrabold text-text-primary truncate pr-2">
                  {selectedPlatform.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setPanelPlatform(null)}
                  className="w-9 h-9 rounded-lg border-2 border-cream-border bg-cream text-text-primary text-[18px] font-bold leading-none flex items-center justify-center hover:bg-cream-dark transition-colors shrink-0"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="rounded-lg border-2 border-cream-border bg-cream/50 px-3 py-2.5">
                  <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide">Sync status</div>
                  <div className="text-[12px] font-bold text-text-primary mt-1">
                    Last synced {selectedPlatform.lastSynced}
                  </div>
                </div>
                <p className="text-[13px] text-text-muted font-medium py-8 text-center">
                  Platform management coming soon.
                </p>
              </div>
              <div className="p-5 border-t-2 border-cream-border shrink-0">
                <button
                  type="button"
                  className="w-full text-center text-[12px] font-bold py-2.5 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
                >
                  Sync all
                </button>
              </div>
            </aside>
          </>
        );
      })()}
    </div>
  );
}
