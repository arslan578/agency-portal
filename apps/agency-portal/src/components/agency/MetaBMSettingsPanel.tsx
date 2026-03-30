'use client';

import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaBMStatus } from '@/lib/api/contracts';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '1340998947829390';
const META_REDIRECT_URI =
  typeof window !== 'undefined'
    ? `${window.location.origin}/settings?tab=meta&meta_callback=1`
    : '';

const sectionTitle = 'text-[15px] font-bold text-text-primary';
const btnPrimary =
  'bg-teal-deep text-white font-bold rounded-[10px] h-[40px] px-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-95 transition-opacity';

interface MetaBMSettingsPanelProps {
  accessToken?: string;
  agencyId?: string | null;
  isAdmin: boolean;
  metaStatus: MetaBMStatus | null;
  setMetaStatus: (s: MetaBMStatus | null) => void;
  metaLoading: boolean;
  setMetaLoading: (v: boolean) => void;
  metaConnecting: boolean;
  setMetaConnecting: (v: boolean) => void;
  metaAutoLinking: boolean;
  setMetaAutoLinking: (v: boolean) => void;
}

export function MetaBMSettingsPanel({
  accessToken,
  agencyId,
  isAdmin,
  metaStatus,
  setMetaStatus,
  metaLoading,
  setMetaLoading,
  metaConnecting,
  setMetaConnecting,
  metaAutoLinking,
  setMetaAutoLinking,
}: MetaBMSettingsPanelProps) {
  // Fetch current status
  const fetchStatus = useCallback(async () => {
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
  }, [accessToken, agencyId, setMetaStatus, setMetaLoading]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle OAuth callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_callback') !== '1') return;
    const code = params.get('code');
    if (!code || !accessToken || !agencyId) return;

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('meta_callback');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    // Exchange code
    (async () => {
      setMetaConnecting(true);
      try {
        await apiClient.post(
          API_ENDPOINTS.META.CONNECT(agencyId),
          { code },
          { accessToken, agencyId },
        );
        toast.success('Meta Business Manager connected!');
        fetchStatus();
      } catch (err: unknown) {
        const msg =
          typeof err === 'object' && err !== null && 'message' in err
            ? (err as { message: string }).message
            : 'Failed to connect Meta Business Manager';
        toast.error(msg);
      } finally {
        setMetaConnecting(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = () => {
    const scopes = [
      'business_management',
      'ads_management',
      'ads_read',
      'read_insights',
    ].join(',');
    const state = Math.random().toString(36).slice(2);
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scopes}&state=${state}&response_type=code`;
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    if (!accessToken || !agencyId) return;
    if (!window.confirm('Disconnect Meta Business Manager? All client ad account links will be reset.')) return;
    try {
      await apiClient.post(
        API_ENDPOINTS.META.DISCONNECT(agencyId),
        {},
        { accessToken, agencyId },
      );
      toast.success('Meta Business Manager disconnected');
      setMetaStatus(null);
      fetchStatus();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to disconnect';
      toast.error(msg);
    }
  };

  const handleAutoLink = async () => {
    if (!accessToken || !agencyId) return;
    setMetaAutoLinking(true);
    try {
      const result = await apiClient.post<{ matched: number; not_linked: number; total: number }>(
        API_ENDPOINTS.META.AUTO_LINK(agencyId),
        {},
        { accessToken, agencyId },
      );
      toast.success(
        `Auto-link complete: ${result.matched} matched, ${result.not_linked} unlinked out of ${result.total} clients`,
      );
      fetchStatus();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? (err as { message: string }).message
          : 'Auto-link failed';
      toast.error(msg);
    } finally {
      setMetaAutoLinking(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  if (metaLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className={sectionTitle}>Meta Business Manager</h2>
        <div className="bg-white border border-border rounded-[12px] p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 bg-surface-secondary rounded w-1/3" />
            <div className="h-10 bg-surface-secondary rounded" />
            <div className="h-8 bg-surface-secondary rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  const connected = metaStatus?.connected ?? false;
  const tokenWarning = metaStatus?.token_warning ?? false;
  const tokenExpired = metaStatus?.connected && !metaStatus?.token_valid;

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className={sectionTitle}>Meta Business Manager</h2>

      <div className="bg-white border border-border rounded-[12px] p-6 space-y-5">
        {/* Connection status badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#e8effe', color: '#1877f2' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-text-primary">
                {connected
                  ? metaStatus?.business_manager_name || 'Connected'
                  : 'Not Connected'}
              </p>
              {connected && (
                <p className="text-[12px] text-text-muted font-medium mt-0.5">
                  BM ID: {metaStatus?.business_manager_id} · Connected{' '}
                  {formatDate(metaStatus?.connected_at ?? null)}
                </p>
              )}
              {!connected && (
                <p className="text-[12px] text-text-muted font-medium mt-0.5">
                  Connect your Meta Business Manager to manage client ad accounts.
                </p>
              )}
            </div>
          </div>

          <span
            className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
              connected && !tokenExpired
                ? 'bg-green-light text-green'
                : connected && tokenExpired
                  ? 'bg-red-light text-red'
                  : 'bg-surface-secondary text-text-muted'
            }`}
          >
            {connected && !tokenExpired
              ? 'Connected'
              : connected && tokenExpired
                ? 'Token Expired'
                : 'Disconnected'}
          </span>
        </div>

        {/* Token expiry warning */}
        {connected && tokenWarning && !tokenExpired && (
          <div className="rounded-lg bg-amber-light/50 border border-amber/20 px-4 py-3">
            <p className="text-[12px] font-semibold text-amber">
              ⚠ Token expires {formatDate(metaStatus?.token_expires_at ?? null)}.
              Reconnect to refresh your access token.
            </p>
          </div>
        )}

        {/* Token expired */}
        {tokenExpired && (
          <div className="rounded-lg bg-red-light/50 border border-red/20 px-4 py-3">
            <p className="text-[12px] font-semibold text-red">
              ✕ Your Meta access token has expired. Reconnect to continue syncing data.
            </p>
          </div>
        )}

        {/* Token validity info */}
        {connected && !tokenExpired && metaStatus?.token_expires_at && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface-secondary/50 px-3 py-2.5">
              <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">
                Token Status
              </div>
              <div className="text-[13px] font-semibold text-green mt-1">✓ Valid</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary/50 px-3 py-2.5">
              <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">
                Expires
              </div>
              <div className="text-[13px] font-semibold text-text-primary mt-1">
                {formatDate(metaStatus.token_expires_at)}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isAdmin && (
          <div className="flex flex-wrap gap-3 pt-2">
            {!connected && (
              <button
                type="button"
                className={btnPrimary}
                onClick={handleConnect}
                disabled={metaConnecting}
              >
                {metaConnecting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    Connect Meta Business Manager
                  </>
                )}
              </button>
            )}

            {connected && tokenExpired && (
              <button
                type="button"
                className={btnPrimary}
                onClick={handleConnect}
                disabled={metaConnecting}
              >
                {metaConnecting ? 'Reconnecting…' : '🔄 Reconnect'}
              </button>
            )}

            {connected && !tokenExpired && (
              <>
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
                  className="bg-surface-secondary border border-border text-text-primary font-bold rounded-[10px] h-[40px] px-4 inline-flex items-center justify-center gap-2 hover:bg-surface-hover transition-colors"
                  onClick={handleConnect}
                >
                  🔄 Reconnect
                </button>

                <button
                  type="button"
                  className="text-[13px] font-semibold text-red hover:underline"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        )}

        {!isAdmin && connected && (
          <p className="text-[12px] text-text-muted">
            Only agency admins can manage Meta Business Manager connections.
          </p>
        )}

        {!isAdmin && !connected && (
          <p className="text-[12px] text-text-muted">
            Ask your agency admin to connect Meta Business Manager.
          </p>
        )}
      </div>

      {/* Help text */}
      <div className="rounded-[12px] bg-surface-secondary/50 border border-border p-4">
        <p className="text-[12px] text-text-secondary leading-relaxed">
          <span className="font-semibold text-text-primary">How it works:</span>{' '}
          Connect your Meta Business Manager to automatically sync all client ad accounts.
          Use <span className="font-semibold">Auto-link</span> to match clients with their ad accounts,
          or assign accounts manually from the{' '}
          <span className="font-semibold">Integrations</span> page.
          Data syncs nightly and on-demand from the client detail page.
        </p>
      </div>
    </div>
  );
}
