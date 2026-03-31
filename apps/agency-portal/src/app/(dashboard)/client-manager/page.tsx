'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { useApiAuth, useClients, useClientHierarchy } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { toast } from 'sonner';

type ClientManagerAccount = {
  id: number;
  platform: string;
  account_id: string;
  display_name: string;
  client_id: number | null;
  client_name: string | null;
  group_client_id: number | null;
  group_client_name: string | null;
  is_assigned: boolean;
  spend_mtd?: number;
};

type ClientManagerClientSummary = {
  id: number;
  name: string;
  industry: string | null;
  account_count: number;
  platforms: string[];
  spend_mtd: number;
  avatar_color?: string | null;
};

type ClientPortalSettings = {
  portal_enabled: boolean;
  contact_email: string | null;
  owner_user_id: number | null;
  portal_link_token: string | null;
  portal_link_expires_at: string | null;
  use_per_platform_markup: boolean;
  global_markup_percent: string | null;
  meta_markup_percent: string | null;
  tiktok_markup_percent: string | null;
  google_markup_percent: string | null;
  show_kaivo_branding: boolean | null;
  show_performance_score: boolean | null;
  show_leaderboard: boolean | null;
  show_trend_comparisons: boolean | null;
};

type ClientManagerClientDetail = {
  client: ClientManagerClientSummary;
  accounts: ClientManagerAccount[];
  portal_settings: ClientPortalSettings | null;
};

type ClientManagerSummary = {
  unassigned_accounts: ClientManagerAccount[];
  clients: ClientManagerClientDetail[];
};

type TabKey = 'accounts' | 'access' | 'settings';

const CLIENT_COLORS = ['#e76f51', '#5c54c8', '#2d9e5a', '#d4860a', '#2a9d8f', '#c85a3d', '#9b59b6'];

const platformIcons: Record<string, { bg: string; color: string; label: string }> = {
  meta: { bg: '#e8effe', color: '#1877f2', label: 'f' },
  tiktok: { bg: '#e6f9fb', color: '#00b8c4', label: 'T' },
  google: { bg: '#fdecea', color: '#ea4335', label: 'G' },
  reddit: { bg: '#fdeeea', color: '#ff4500', label: 'r' },
};

const ACC_COLORS: Record<string, string> = {
  NS: '#5c54c8', FS: '#d4860a', HC: '#e76f51', PO: '#5c54c8', SH: '#2d9e5a',
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function formatUsd(val?: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
}
function getClientColor(idx: number) {
  return CLIENT_COLORS[idx % CLIENT_COLORS.length];
}
function getAccColor(name: string) {
  const init = getInitials(name);
  if (ACC_COLORS[init]) return ACC_COLORS[init];
  const hue = (name.charCodeAt(0) * 37 + name.charCodeAt(1 % name.length) * 13) % 360;
  return `hsl(${hue},55%,45%)`;
}

// Small reusable toggle
function Toggle({ checked, onChange }: { checked: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange?.(!checked)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 20, cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--teal, #2a9d8f)' : 'var(--cream-dark, #ece6db)',
        border: `2px solid ${checked ? 'var(--teal, #2a9d8f)' : 'var(--cream-border, #ddd6c8)'}`,
        transition: 'all .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 16 : 2, width: 12, height: 12,
        borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.15)', transition: 'left .2s',
      }} />
    </div>
  );
}

// Platform pip
function PltPip({ platform, size = 18 }: { platform: string; size?: number }) {
  const p = platformIcons[platform.toLowerCase()];
  if (!p) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 800, background: p.bg, color: p.color, flexShrink: 0,
    }}>{p.label}</div>
  );
}

export default function ClientManagerPage() {
  const { accessToken, agencyId } = useApiAuth();
  const { clients: allClients } = useClients();
  const { hierarchy } = useClientHierarchy('last_30d');

  const [summary, setSummary] = useState<ClientManagerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [activeClientTabs, setActiveClientTabs] = useState<Record<number, TabKey>>({});
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  // Modals
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClientSearch, setAssignClientSearch] = useState('');
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientIndustry, setNewClientIndustry] = useState('E-commerce');
  const [newClientCurrency, setNewClientCurrency] = useState('USD ($)');

  // Search/Filters
  const [accSearch, setAccSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const hierarchyPlatformsByClientId = useMemo(() => {
    const map: Record<number, string[]> = {};
    if (!hierarchy) return map;
    hierarchy.clients.forEach((c) => {
      map[c.id] = c.platforms.map((p) => p.key.toLowerCase());
    });
    return map;
  }, [hierarchy]);

  const loadSummary = useCallback(async () => {
    if (!accessToken || !agencyId) return;
    setLoading(true);
    try {
      const data = await apiClient.get<ClientManagerSummary>(
        API_ENDPOINTS.CLIENT_MANAGER.SUMMARY(agencyId),
        { accessToken, agencyId },
      );
      setSummary(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load Client Manager');
    } finally {
      setLoading(false);
    }
  }, [accessToken, agencyId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const toggleAccountSelection = (id: number) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleClientExpansion = (id: number) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAssign = async (clientId: number) => {
    if (!accessToken || !agencyId) return;
    const ids = Array.from(selectedAccountIds);
    if (ids.length === 0) return;

    // Map IDs back to objects for the backend flexible selector
    // We need to look in unassigned accounts
    const selectedAccounts = (summary?.unassigned_accounts ?? [])
      .filter(a => selectedAccountIds.has(a.id))
      .map(a => ({ id: a.id, platform: a.platform, account_id: a.account_id }));

    try {
      await apiClient.post(
        API_ENDPOINTS.CLIENT_MANAGER.ASSIGN(agencyId, clientId),
        { client_id: clientId, accounts: selectedAccounts },
        { accessToken, agencyId }
      );
      toast.success('Accounts assigned');
      setSelectedAccountIds(new Set());
      setAssignModalOpen(false);
      loadSummary();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign');
    }
  };

  const handleDetach = async (e: React.MouseEvent, accId: number) => {
    e.stopPropagation();
    if (!accessToken || !agencyId) return;
    // Note: Items 11 & 48 in checklist require client_id as well
    // We'll find which client this account belongs to
    const clientWithAcc = summary?.clients.find(c => c.accounts.some(a => a.id === accId));
    if (!clientWithAcc) {
       toast.error('Could not find client for this account');
       return;
    }
    try {
      await apiClient.delete(
        API_ENDPOINTS.CLIENT_MANAGER.DETACH(agencyId, clientWithAcc.client.id, accId),
        { accessToken, agencyId }
      );
      toast.success('Account detached');
      loadSummary();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to detach');
    }
  };

  const handleCreateClient = async () => {
    if (!accessToken || !agencyId) return;
    const name = newClientName.trim();
    if (!name) return;
    try {
      const created = await apiClient.post<{ id: number }>(
        API_ENDPOINTS.AGENCY.CLIENT_CREATE(agencyId),
        { name, industry: newClientIndustry },
        { accessToken, agencyId }
      );
      const ids = Array.from(selectedAccountIds);
      if (ids.length > 0) {
        await apiClient.post(
          API_ENDPOINTS.CLIENT_MANAGER.ASSIGN(agencyId, created.id),
          { platform_account_ids: ids },
          { accessToken, agencyId }
        );
      }
      toast.success('Client created and accounts assigned');
      setNewClientModalOpen(false);
      setSelectedAccountIds(new Set());
      loadSummary();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create client');
    }
  };

  const groupedUnassigned = useMemo(() => {
    if (!summary) return {};
    const filtered = summary.unassigned_accounts.filter(a =>
      a.display_name?.toLowerCase().includes(accSearch.toLowerCase()) ||
      a.account_id.toLowerCase().includes(accSearch.toLowerCase())
    );
    const groups: Record<string, ClientManagerAccount[]> = {};
    filtered.forEach(a => {
      const p = a.platform.toLowerCase();
      if (!groups[p]) groups[p] = [];
      groups[p].push(a);
    });
    return groups;
  }, [summary, accSearch]);

  const filteredClients = useMemo(() => {
    if (!summary) return [];
    return summary.clients.filter(c => c.client.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [summary, clientSearch]);

  const assignModalClients = useMemo(() => {
    const q = assignClientSearch.toLowerCase();
    return allClients.filter(c => c.name.toLowerCase().includes(q));
  }, [allClients, assignClientSearch]);

  if (!summary && loading) {
    return <div style={{ padding: 48, textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>Loading Client Manager...</div>;
  }

  // ─── STYLES ────────────────────────────────────────────────────────────────
  const S = {
    page: {
      display: 'flex', flexDirection: 'column' as const, height: '100%',
      background: 'var(--cream, #f4efe6)', overflow: 'hidden',
      fontFamily: "'Space Grotesk', sans-serif",
    },
    topbar: {
      height: 56, background: '#fff', borderBottom: '2px solid var(--cream-border, #ddd6c8)',
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, flexShrink: 0,
    },
    topbarTitle: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary, #1a1a2e)' },
    topbarSub: { fontSize: 12, color: 'var(--text-muted, #9a9aaa)', fontWeight: 500, marginLeft: 10 },
    btnPrimary: {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
      borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
      background: 'var(--teal, #2a9d8f)', border: '2px solid var(--teal, #2a9d8f)',
      color: '#fff', fontFamily: 'inherit', transition: 'all .12s',
    },
    btnSm: {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
      borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: '#fff', border: '2px solid var(--cream-border, #ddd6c8)',
      color: 'var(--text-primary, #1a1a2e)', fontFamily: 'inherit', transition: 'all .12s',
    },
    btnSmPrimary: {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
      borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: 'var(--teal, #2a9d8f)', border: '2px solid var(--teal, #2a9d8f)',
      color: '#fff', fontFamily: 'inherit', transition: 'all .12s',
    },
    content: { flex: 1, overflowY: 'auto' as const, padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: 14 },
    // Suggestion banner
    suggestBar: {
      background: 'var(--teal-light, #e8f5f3)', border: '1.5px solid #a8ddd8',
      borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
    },
    suggestIcon: {
      width: 30, height: 30, borderRadius: 7, background: 'var(--teal, #2a9d8f)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
    },
    suggestTitle: { fontSize: 12.5, fontWeight: 800, color: 'var(--teal-dark, #1f7a6e)' },
    suggestSub: { fontSize: 11, color: 'var(--teal-dark, #1f7a6e)', opacity: 0.75, marginTop: 2, fontWeight: 500 },
    chip: {
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
      borderRadius: 20, background: '#fff', border: '1.5px solid #a8ddd8',
      fontSize: 11, fontWeight: 700, color: 'var(--teal-dark, #1f7a6e)', cursor: 'pointer', transition: 'all .12s',
    },
    // Two col
    twoCol: { display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, flex: 1, minHeight: 0 },
    // Panel
    panel: {
      background: '#fff', border: '2px solid var(--cream-border, #ddd6c8)',
      borderRadius: 12, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden',
    },
    panelHd: {
      padding: '13px 16px', borderBottom: '2px solid var(--cream-border, #ddd6c8)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    },
    panelTitle: { fontSize: 13, fontWeight: 800, color: 'var(--text-primary, #1a1a2e)', display: 'flex', alignItems: 'center', gap: 0 },
    panelSub: { fontSize: 11, color: 'var(--text-muted, #9a9aaa)', fontWeight: 500, marginTop: 2 },
    badgeAmber: {
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
      background: 'var(--amber-light, #fef3dc)', color: 'var(--amber, #d4860a)',
      border: '1px solid #f0d090', marginLeft: 6,
    },
    badgeTeal: {
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
      background: 'var(--teal-light, #e8f5f3)', color: 'var(--teal-dark, #1f7a6e)', marginLeft: 6,
    },
    searchRow: { padding: '9px 14px', borderBottom: '1px solid var(--cream-border, #ddd6c8)' },
    searchInput: {
      width: '100%', padding: '7px 11px', border: '1.5px solid var(--cream-border, #ddd6c8)',
      borderRadius: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
      color: 'var(--text-primary, #1a1a2e)', background: 'var(--cream, #f4efe6)', outline: 'none',
    },
    panelBody: { flex: 1, overflowY: 'auto' as const },
    // Platform group
    pltGrpHd: {
      padding: '6px 14px', background: 'var(--cream, #f4efe6)', display: 'flex', alignItems: 'center',
      gap: 7, fontSize: 9, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' as const,
      color: 'var(--text-muted, #9a9aaa)',
    },
    // Account row
    accRow: {
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px',
      borderBottom: '1px solid var(--cream-border, #ddd6c8)', cursor: 'pointer',
      transition: 'background .1s', userSelect: 'none' as const,
    },
    accChk: {
      width: 15, height: 15, borderRadius: 4, border: '2px solid var(--cream-border, #ddd6c8)',
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8,
    },
    accChkOn: {
      width: 15, height: 15, borderRadius: 4, border: '2px solid var(--teal, #2a9d8f)',
      background: 'var(--teal, #2a9d8f)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff',
    },
    accAv: {
      width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0,
    },
    accName: { fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #1a1a2e)' },
    accId: { fontSize: 9.5, color: 'var(--text-muted, #9a9aaa)', fontFamily: "'Space Mono', monospace", marginTop: 1 },
    accSpend: { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #5a5a72)', marginLeft: 'auto', flexShrink: 0 },
    // Assign bar
    assignBar: {
      padding: '10px 14px', borderTop: '2px solid var(--teal, #2a9d8f)',
      background: 'var(--teal-light, #e8f5f3)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    },
    // Client card
    cc: {
      background: '#fff', border: '2px solid var(--cream-border, #ddd6c8)',
      borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s',
    },
    ccOpen: {
      background: '#fff', border: '2px solid var(--teal, #2a9d8f)',
      borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s',
    },
    ccHd: { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
    ccAv: {
      width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
    },
    ccName: { fontSize: 13, fontWeight: 800, color: 'var(--text-primary, #1a1a2e)' },
    ccSub: { fontSize: 10.5, color: 'var(--text-muted, #9a9aaa)', marginTop: 2, fontWeight: 500 },
    // Tabs
    ccTabs: {
      display: 'flex', borderBottom: '2px solid var(--cream-border, #ddd6c8)',
      background: 'var(--cream, #f4efe6)',
    },
    ccTabActive: {
      padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      color: 'var(--teal, #2a9d8f)',
      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
      borderBottom: '2px solid var(--teal, #2a9d8f)',
      marginBottom: -2, background: '#fff', fontFamily: 'inherit',
    },
    ccTab: {
      padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      color: 'var(--text-muted, #9a9aaa)',
      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
      borderBottom: '2px solid transparent',
      marginBottom: -2, background: 'transparent', fontFamily: 'inherit',
    },
    // Attached account row
    attAcc: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      background: 'var(--cream, #f4efe6)', borderRadius: 7,
      border: '1px solid var(--cream-border, #ddd6c8)', marginBottom: 6,
    },
    attName: { fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #1a1a2e)' },
    attId: { fontSize: 9.5, color: 'var(--text-muted, #9a9aaa)', fontFamily: "'Space Mono', monospace", marginTop: 1 },
    attSpend: { fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #5a5a72)' },
    attachBtn: {
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
      border: '1.5px dashed var(--cream-border, #ddd6c8)', borderRadius: 7,
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #9a9aaa)',
      cursor: 'pointer', transition: 'all .12s', width: '100%', background: 'transparent', fontFamily: 'inherit',
    },
    // Form elements
    formInput: {
      padding: '8px 10px', border: '2px solid var(--cream-border, #ddd6c8)', borderRadius: 7,
      fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-primary, #1a1a2e)',
      background: '#fff', outline: 'none', width: '100%',
    },
    formSelect: {
      padding: '8px 10px', border: '2px solid var(--cream-border, #ddd6c8)', borderRadius: 7,
      fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-primary, #1a1a2e)',
      background: '#fff', outline: 'none', cursor: 'pointer', width: '100%',
    },
    formLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary, #5a5a72)', marginBottom: 4, display: 'block' },
    // Toggle row
    toggleRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--cream-border, #ddd6c8)',
    },
    toggleLbl: { fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary, #1a1a2e)' },
    toggleDesc: { fontSize: 11, color: 'var(--text-muted, #9a9aaa)', marginTop: 2, fontWeight: 500 },
    // Access panel
    linkBox: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px',
      background: 'var(--cream, #f4efe6)', border: '1.5px solid var(--cream-border, #ddd6c8)', borderRadius: 8,
    },
    linkUrl: {
      fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--text-secondary, #5a5a72)',
      fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    },
    copyBtn: {
      fontSize: 10, fontWeight: 700, fontFamily: 'inherit', padding: '3px 8px', borderRadius: 5,
      border: '1.5px solid var(--cream-border, #ddd6c8)', background: '#fff', cursor: 'pointer',
      color: 'var(--text-secondary, #5a5a72)', flexShrink: 0,
    },
    // Settings
    settingsSection: { marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--cream-border, #ddd6c8)' },
    settingsSectionTitle: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: 'var(--text-muted, #9a9aaa)', marginBottom: 10 },
    markupRow: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      background: 'var(--cream, #f4efe6)', borderRadius: 7, border: '1px solid var(--cream-border, #ddd6c8)', marginBottom: 6,
    },
    markupInput: {
      width: 72, padding: '5px 8px', border: '1.5px solid var(--cream-border, #ddd6c8)', borderRadius: 6,
      fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, textAlign: 'right' as const,
      color: 'var(--text-primary, #1a1a2e)', background: '#fff', outline: 'none',
    },
    // Modal
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(26,26,46,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    modal: { background: '#fff', borderRadius: 14, width: 460, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' as const },
    modalHd: {
      padding: '16px 20px', borderBottom: '2px solid var(--cream-border, #ddd6c8)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    modalTitle: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #1a1a2e)' },
    modalClose: {
      width: 26, height: 26, borderRadius: 6, border: '2px solid var(--cream-border, #ddd6c8)',
      background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 15, color: 'var(--text-muted, #9a9aaa)', fontFamily: 'inherit',
    },
    modalBody: { padding: 18, display: 'flex', flexDirection: 'column' as const, gap: 12 },
    modalFt: {
      padding: '13px 18px', borderTop: '2px solid var(--cream-border, #ddd6c8)',
      display: 'flex', justifyContent: 'flex-end', gap: 8,
    },
    clientOpt: {
      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
      borderRadius: 8, border: '2px solid var(--cream-border, #ddd6c8)', cursor: 'pointer', transition: 'all .12s',
    },
    clientOptAv: {
      width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
    },
    selAccChip: {
      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px',
      background: 'var(--teal-light, #e8f5f3)', borderRadius: 6, border: '1px solid #a8ddd8',
      fontSize: 11, fontWeight: 600, color: 'var(--teal-dark, #1f7a6e)',
    },
    sectionLabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: 'var(--text-muted, #9a9aaa)', marginBottom: 6 },
  };

  return (
    <div style={S.page}>
      {/* TOPBAR */}
      <div style={S.topbar}>
        <div>
          <span style={S.topbarTitle}>Client Manager</span>
          <span style={S.topbarSub}>Group platform accounts into clients</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button style={S.btnPrimary} onClick={() => setNewClientModalOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 1v14M1 8h14" /></svg>
            New Client
          </button>
        </div>
      </div>

      <div style={S.content}>
        {/* SUGGESTION BANNER */}
        {!suggestDismissed && (
          <div style={S.suggestBar}>
            <div style={S.suggestIcon}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2"><path d="M8 1l1.8 3.6L14 5.6l-3 2.9.7 4.1L8 10.5l-3.7 2.1.7-4.1-3-2.9 4.2-.8z" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={S.suggestTitle}>Kaivo spotted 2 likely client matches across your connected platforms</div>
              <div style={S.suggestSub}>These accounts share similar names — confirm to group them into a single client.</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 8 }}>
                {[
                  { name: 'Nova Skincare', count: 3, plts: ['meta', 'tiktok', 'google'] },
                  { name: 'Forge Supplements', count: 2, plts: ['meta', 'google'] },
                ].map(item => (
                  <div key={item.name} style={S.chip}>
                    {item.plts.map(p => <PltPip key={p} platform={p} size={14} />)}
                    {item.name} &nbsp;·&nbsp; {item.count} accounts
                    <strong style={{ color: 'var(--teal, #2a9d8f)' }}>Confirm →</strong>
                  </div>
                ))}
              </div>
            </div>
            <button style={S.btnSm} onClick={() => setSuggestDismissed(true)}>Dismiss</button>
          </div>
        )}

        {/* TWO COL */}
        <div style={S.twoCol}>

          {/* LEFT: UNASSIGNED */}
          <div style={{ ...S.panel, height: '75vh', position: 'sticky' as const, top: 0 }}>
            <div style={S.panelHd}>
              <div>
                <div style={S.panelTitle}>
                  Unassigned Accounts
                  <span style={S.badgeAmber}>{summary?.unassigned_accounts.length ?? 0}</span>
                </div>
                <div style={S.panelSub}>Tick accounts then assign them to a client</div>
              </div>
            </div>
            <div style={S.searchRow}>
              <input
                style={S.searchInput}
                type="text"
                placeholder="Search accounts..."
                value={accSearch}
                onChange={e => setAccSearch(e.target.value)}
              />
            </div>
            <div style={S.panelBody}>
              {Object.entries(groupedUnassigned).map(([platform, accounts]) => (
                <div key={platform} style={{ borderBottom: '1px solid var(--cream-border, #ddd6c8)' }}>
                  <div style={S.pltGrpHd}>
                    <PltPip platform={platform} size={18} />
                    {platform} · {accounts.length} unassigned
                  </div>
                  {accounts.map(acc => {
                    const sel = selectedAccountIds.has(acc.id);
                    const initials = getInitials(acc.display_name || acc.account_id);
                    return (
                      <div
                        key={acc.id}
                        style={{ ...S.accRow, background: sel ? 'var(--teal-light, #e8f5f3)' : undefined }}
                        onClick={() => toggleAccountSelection(acc.id)}
                      >
                        <div style={sel ? S.accChkOn : S.accChk}>
                          {sel && <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 8l3 3 7-7" /></svg>}
                        </div>
                        <div style={{ ...S.accAv, background: getAccColor(acc.display_name || acc.account_id) }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={S.accName}>{acc.display_name || acc.account_id}</div>
                          <div style={S.accId}>{acc.account_id}</div>
                        </div>
                        {acc.spend_mtd !== undefined && (
                          <div style={S.accSpend}>{formatUsd(acc.spend_mtd)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {(!summary || summary.unassigned_accounts.length === 0) && (
                <div style={{ padding: 48, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  All accounts assigned
                </div>
              )}
            </div>

            {/* ASSIGN BAR */}
            {selectedAccountIds.size > 0 && (
              <div style={S.assignBar}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-dark, #1f7a6e)', flex: 1 }}>
                  {selectedAccountIds.size} account{selectedAccountIds.size !== 1 ? 's' : ''} selected
                </span>
                <button style={S.btnSm} onClick={() => setAssignModalOpen(true)}>Assign to existing client</button>
                <button style={S.btnSmPrimary} onClick={() => setNewClientModalOpen(true)}>Create new client</button>
              </div>
            )}
          </div>

          {/* RIGHT: CLIENTS */}
          <div style={{ ...S.panel, maxHeight: '75vh' }}>
            <div style={S.panelHd}>
              <div>
                <div style={S.panelTitle}>
                  Clients
                  <span style={S.badgeTeal}>{summary?.clients.length ?? 0} clients</span>
                </div>
                <div style={S.panelSub}>Expand a client to manage accounts, access &amp; settings</div>
              </div>
            </div>
            <div style={S.searchRow}>
              <input
                style={S.searchInput}
                type="text"
                placeholder="Search clients..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
              />
            </div>
            <div style={{ ...S.panelBody, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredClients.map((detail, idx) => {
                const c = detail.client;
                const clientHierarchyPlatforms = hierarchyPlatformsByClientId[c.id] ?? [];
                const headerPlatforms = Array.from(
                  new Set([
                    ...clientHierarchyPlatforms,
                    ...detail.accounts.map((a) => a.platform.toLowerCase()),
                  ]),
                );
                const isExpanded = expandedClients.has(c.id);
                const activeTab = activeClientTabs[c.id] || 'accounts';
                const clientColor = getClientColor(idx);

                return (
                  <div key={c.id} style={isExpanded ? S.ccOpen : S.cc}>
                    {/* CLIENT HEADER */}
                    <div style={S.ccHd} onClick={() => toggleClientExpansion(c.id)}>
                      <div style={{ ...S.ccAv, background: c.avatar_color || clientColor }}>{getInitials(c.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.ccName}>{c.name}</div>
                        <div style={S.ccSub}>{c.account_count} accounts · {formatUsd(c.spend_mtd)} MTD</div>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {headerPlatforms.map(p => (
                          <PltPip key={p} platform={p} size={18} />
                        ))}
                      </div>
                      <div style={{
                        flexShrink: 0, marginLeft: 6, color: 'var(--text-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                      </div>
                    </div>

                    {/* CLIENT BODY */}
                    {isExpanded && (
                      <div style={{ borderTop: '2px solid var(--cream-border, #ddd6c8)' }}>
                        {/* TABS */}
                        <div style={S.ccTabs}>
                          {(['accounts', 'access', 'settings'] as TabKey[]).map(t => (
                            <button
                              key={t}
                              style={activeTab === t ? S.ccTabActive : S.ccTab}
                              onClick={() => setActiveClientTabs(prev => ({ ...prev, [c.id]: t }))}
                            >
                              {t === 'accounts' ? 'Accounts' : t === 'access' ? 'Client Access' : 'Settings'}
                            </button>
                          ))}
                        </div>

                        {/* ACCOUNTS PANE */}
                        {activeTab === 'accounts' && (
                          <div style={{ padding: 14 }}>
                            {detail.accounts.map(acc => (
                              <div key={acc.id} style={S.attAcc} className="group/row">
                                <div style={{
                                  width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0,
                                  background: platformIcons[acc.platform.toLowerCase()]?.bg,
                                  color: platformIcons[acc.platform.toLowerCase()]?.color,
                                }}>
                                  {platformIcons[acc.platform.toLowerCase()]?.label || acc.platform[0]}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={S.attName}>{acc.display_name || acc.account_id}</div>
                                  <div style={S.attId}>{acc.account_id}</div>
                                </div>
                                {acc.spend_mtd !== undefined && (
                                  <div style={S.attSpend}>{formatUsd(acc.spend_mtd)}</div>
                                )}
                                <button
                                  onClick={e => handleDetach(e, acc.id)}
                                  style={{
                                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                                    cursor: 'pointer', padding: '3px 7px', borderRadius: 4,
                                    border: 'none', background: 'none', fontFamily: 'inherit',
                                  }}
                                  onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--red, #d94040)'; (e.target as HTMLElement).style.background = 'var(--red-light, #fdeaea)'; }}
                                  onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; (e.target as HTMLElement).style.background = 'none'; }}
                                >
                                  Detach
                                </button>
                              </div>
                            ))}
                            <button
                              style={S.attachBtn}
                              onClick={() => setAssignModalOpen(true)}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal, #2a9d8f)'; (e.currentTarget as HTMLElement).style.color = 'var(--teal, #2a9d8f)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cream-border, #ddd6c8)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #9a9aaa)'; }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 1v14M1 8h14" /></svg>
                              Attach another account
                            </button>
                          </div>
                        )}

                        {/* ACCESS PANE */}
                        {activeTab === 'access' && (
                          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ ...S.toggleRow, paddingTop: 0 }}>
                              <div>
                                <div style={S.toggleLbl}>Portal access enabled</div>
                                <div style={S.toggleDesc}>Client can view their portal via the magic link</div>
                              </div>
                              <Toggle checked={detail.portal_settings?.portal_enabled ?? false} />
                            </div>
                            <div style={{ ...S.toggleRow }}>
                              <div>
                                <div style={S.toggleLbl}>Send email notifications to client</div>
                                <div style={S.toggleDesc}>Notify client when a new report is shared</div>
                              </div>
                              <Toggle checked={false} />
                            </div>
                            <div>
                              <label style={S.formLabel}>CLIENT CONTACT EMAIL</label>
                              <input style={S.formInput} type="email" defaultValue={detail.portal_settings?.contact_email ?? ''} placeholder="client@example.com" />
                            </div>
                            <div>
                              <label style={S.formLabel}>ACCOUNT OWNER (YOUR TEAM)</label>
                              <select style={S.formSelect}>
                                <option>James Lewis</option>
                                <option>Sophie Reed</option>
                                <option>Tom Keller</option>
                              </select>
                            </div>
                            {detail.portal_settings?.portal_link_token ? (
                              <div>
                                <label style={S.formLabel}>ACTIVE PORTAL LINK</label>
                                <div style={S.linkBox}>
                                  <span style={S.linkUrl}>
                                    mediaco.kaivo.app/{c.name.toLowerCase().replace(/ /g, '-')}?token={detail.portal_settings.portal_link_token}
                                  </span>
                                  <button style={S.copyBtn}>Copy</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '8px 11px', background: 'var(--cream)', borderRadius: 7, border: '1.5px solid var(--cream-border)' }}>
                                No link generated yet
                              </div>
                            )}
                            <button style={{ ...S.btnSmPrimary, width: '100%', justifyContent: 'center', marginTop: 4 }}>
                              ↺ Regenerate link
                            </button>
                          </div>
                        )}

                        {/* SETTINGS PANE */}
                        {activeTab === 'settings' && (
                          <div style={{ padding: 14 }}>
                            {/* Client details */}
                            <div style={S.settingsSection}>
                              <div style={S.settingsSectionTitle}>Client Details</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div><label style={S.formLabel}>Client Name</label><input style={S.formInput} type="text" defaultValue={c.name} /></div>
                                <div><label style={S.formLabel}>Industry</label>
                                  <select style={S.formSelect}>
                                    <option>{c.industry || 'E-commerce'}</option>
                                    <option>Beauty &amp; Personal Care</option>
                                    <option>Health &amp; Fitness</option>
                                    <option>Food &amp; Beverage</option>
                                    <option>Other</option>
                                  </select>
                                </div>
                                <div><label style={S.formLabel}>Billing Reference / PO</label><input style={S.formInput} type="text" placeholder="e.g. HC-2026-001" /></div>
                                <div><label style={S.formLabel}>Reporting Currency</label>
                                  <select style={S.formSelect}><option>USD ($)</option><option>GBP (£)</option><option>EUR (€)</option></select>
                                </div>
                              </div>
                            </div>
                            {/* Markup */}
                            <div style={S.settingsSection}>
                              <div style={S.settingsSectionTitle}>Spend Markup</div>
                              <div style={{ ...S.toggleRow, paddingTop: 0 }}>
                                <div>
                                  <div style={S.toggleLbl}>Enable per-platform markup</div>
                                  <div style={S.toggleDesc}>Clients always see marked-up spend — never platform cost.</div>
                                </div>
                                <Toggle checked={detail.portal_settings?.use_per_platform_markup ?? false} />
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <div style={S.markupRow}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 12, fontWeight: 700 }}>
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v4l2.5 1.5" /></svg>
                                    Global rate (all platforms)
                                  </div>
                                  <input style={S.markupInput} type="number" defaultValue={Number(detail.portal_settings?.global_markup_percent) || 15} min={0} max={100} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>
                                  Client sees spend × {(1 + (Number(detail.portal_settings?.global_markup_percent) || 15) / 100).toFixed(2)}. All CPC, cost/conv. and spend metrics recalculate at this rate.
                                </div>
                              </div>
                            </div>
                            {/* Portal display */}
                            <div style={{ ...S.settingsSection, borderBottom: 'none', marginBottom: 0 }}>
                              <div style={S.settingsSectionTitle}>
                                Client Portal Display
                                <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--teal-light)', color: 'var(--teal-dark)', padding: '2px 7px', borderRadius: 4, marginLeft: 4 }}>Per-client overrides</span>
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10 }}>
                                Global defaults set in Settings. Toggles here override the global default for this client only.
                              </div>
                              {[
                                { label: 'Show performance score', desc: 'Override: hide score for this client only', val: detail.portal_settings?.show_performance_score ?? true, globalOn: true },
                                { label: 'Show campaign leaderboard', desc: 'Override: hide leaderboard for this client only', val: detail.portal_settings?.show_leaderboard ?? true, globalOn: true },
                                { label: 'Show trend comparisons', desc: 'Override: hide trend arrows for this client only', val: detail.portal_settings?.show_trend_comparisons ?? true, globalOn: true },
                              ].map(item => (
                                <div key={item.label} style={{ ...S.toggleRow }}>
                                  <div>
                                    <div style={S.toggleLbl}>
                                      {item.label}
                                      <span style={{ fontSize: 9, fontWeight: 600, color: item.globalOn ? 'var(--green, #2d9e5a)' : 'var(--text-muted)', marginLeft: 6 }}>
                                        Global: {item.globalOn ? 'On' : 'Off'}
                                      </span>
                                    </div>
                                    <div style={S.toggleDesc}>{item.desc}</div>
                                  </div>
                                  <Toggle checked={item.val} />
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                              <button style={S.btnSmPrimary}>Save Settings</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {summary?.clients.length === 0 && (
                <div style={{ padding: 80, textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.4, marginBottom: 8 }}>No Active Clients</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Assign accounts from the left panel to begin.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ASSIGN TO EXISTING MODAL */}
      {assignModalOpen && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setAssignModalOpen(false); }}>
          <div style={S.modal}>
            <div style={S.modalHd}>
              <div style={S.modalTitle}>Assign to Existing Client</div>
              <button style={S.modalClose} onClick={() => setAssignModalOpen(false)}>×</button>
            </div>
            <div style={S.modalBody}>
              <div>
                <div style={S.sectionLabel}>Selected accounts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Array.from(selectedAccountIds).map(id => {
                    const acc = summary?.unassigned_accounts.find(a => a.id === id);
                    const p = platformIcons[acc?.platform.toLowerCase() ?? ''];
                    return (
                      <div key={id} style={S.selAccChip}>
                        {p && <div style={{ width: 13, height: 13, borderRadius: 3, background: p.bg, color: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800 }}>{p.label}</div>}
                        {acc?.display_name || acc?.account_id}
                        <span style={{ opacity: 0.6, fontSize: 10 }}>· {acc?.platform}</span>
                      </div>
                    );
                  })}
                  {selectedAccountIds.size === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>No accounts selected — you can still assign using the Attach button on the client.</div>
                  )}
                </div>
              </div>
              <div>
                <div style={S.sectionLabel}>Choose a client</div>
                <input
                  style={{ ...S.searchInput, marginBottom: 8 }}
                  type="text"
                  placeholder="Search clients..."
                  value={assignClientSearch}
                  onChange={e => setAssignClientSearch(e.target.value)}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                  {assignModalClients.map((c, idx) => (
                    <div
                      key={c.id}
                      style={S.clientOpt}
                      onClick={() => handleAssign(c.id)}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal, #2a9d8f)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--cream-border, #ddd6c8)'}
                    >
                      <div style={{ ...S.clientOptAv, background: c.avatar_color || getClientColor(idx) }}>{getInitials(c.name)}</div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.industry}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '12px 0', position: 'relative' }}>
                  <span style={{ position: 'relative', zIndex: 1, background: '#fff', padding: '0 8px' }}>or</span>
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--cream-border)', zIndex: 0 }} />
                </div>
                <button
                  style={{ ...S.btnSm, width: '100%', justifyContent: 'center' }}
                  onClick={() => { setAssignModalOpen(false); setNewClientModalOpen(true); }}
                >
                  Create a new client instead →
                </button>
              </div>
            </div>
            <div style={S.modalFt}>
              <button style={S.btnSm} onClick={() => setAssignModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CLIENT MODAL */}
      {newClientModalOpen && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setNewClientModalOpen(false); }}>
          <div style={S.modal}>
            <div style={S.modalHd}>
              <div style={S.modalTitle}>Create New Client</div>
              <button style={S.modalClose} onClick={() => setNewClientModalOpen(false)}>×</button>
            </div>
            <div style={S.modalBody}>
              <div>
                <label style={S.formLabel}>CLIENT NAME *</label>
                <input
                  style={S.formInput}
                  type="text"
                  placeholder="e.g. Nova Skincare"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={S.formLabel}>INDUSTRY</label>
                  <select style={S.formSelect} value={newClientIndustry} onChange={e => setNewClientIndustry(e.target.value)}>
                    <option>E-commerce</option>
                    <option>Beauty &amp; Personal Care</option>
                    <option>Health &amp; Fitness</option>
                    <option>Food &amp; Beverage</option>
                    <option>Fashion &amp; Apparel</option>
                    <option>Home &amp; Garden</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={S.formLabel}>REPORTING CURRENCY</label>
                  <select style={S.formSelect} value={newClientCurrency} onChange={e => setNewClientCurrency(e.target.value)}>
                    <option>USD ($)</option>
                    <option>GBP (£)</option>
                    <option>EUR (€)</option>
                  </select>
                </div>
              </div>
              {selectedAccountIds.size > 0 && (
                <div style={{ padding: 12, background: 'var(--teal-light, #e8f5f3)', border: '1.5px solid #a8ddd8', borderRadius: 8 }}>
                  <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Accounts to attach</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                    {Array.from(selectedAccountIds).map(id => {
                      const acc = summary?.unassigned_accounts.find(a => a.id === id);
                      return (
                        <div key={id} style={{ padding: '3px 8px', background: '#fff', borderRadius: 5, border: '1px solid var(--teal, #2a9d8f)', fontSize: 10, fontWeight: 600, color: 'var(--teal-dark, #1f7a6e)' }}>
                          {acc?.display_name || acc?.account_id}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div style={S.modalFt}>
              <button style={S.btnSm} onClick={() => setNewClientModalOpen(false)}>Cancel</button>
              <button
                style={{ ...S.btnSmPrimary, opacity: !newClientName.trim() ? 0.5 : 1, cursor: !newClientName.trim() ? 'not-allowed' : 'pointer' }}
                onClick={handleCreateClient}
                disabled={!newClientName.trim()}
              >
                Create Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}