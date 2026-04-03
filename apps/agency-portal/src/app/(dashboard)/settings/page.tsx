'use client';

import { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDashboard, useMembers, useInvites, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import {
  ROLE_PERMISSIONS,
  type AgencyRole,
} from '@/lib/api/contracts';
import type { TeamMember } from '@/lib/api/contracts';

type SettingsTab =
  | 'agency'
  | 'team'
  | 'whitelabel'
  | 'account'
  | 'profile';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'agency', label: 'Agency Profile' },
  { id: 'team', label: 'Team & Access' },
  { id: 'whitelabel', label: 'White-label' },
  { id: 'account', label: 'Account' },
  { id: 'profile', label: 'My Profile' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

const inputClass =
  'w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-teal-deep';
const labelClass = 'block text-[12.5px] font-semibold text-text-primary mb-[6px]';
const btnPrimary =
  'bg-teal-deep text-white font-semibold rounded-[10px] h-[40px] px-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-95 transition-opacity';
const sectionTitle = 'text-[15px] font-bold text-text-primary';

const MATRIX_ROLES: AgencyRole[] = [
  'agency_admin',
  'agency_manager',
  'agency_viewer',
];

type InviteApiRole = 'agency_admin' | 'agency_member' | 'agency_viewer';

type DisplayMember = {
  id: number;
  name: string;
  email: string;
  initials: string;
  color: string;
  roleKey: string;
  status: 'active' | 'invited';
  lastActive: string;
  inviteId?: number;
};

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function roleBadgeClass(roleLabel: string) {
  const r = roleLabel.toLowerCase();
  if (r === 'admin')
    return 'bg-coral-light text-coral border border-coral/25';
  if (r === 'manager')
    return 'bg-teal-light text-teal-deep border border-teal/25';
  return 'bg-surface-secondary text-text-secondary border border-border';
}

function statusBadgeClass(status: 'active' | 'invited') {
  if (status === 'active')
    return 'bg-green-light text-green border border-green/20';
  return 'bg-amber-light text-amber border border-amber/30';
}

function formatRoleDisplay(role: string): string {
  const map: Record<string, string> = {
    agency_admin: 'Admin',
    agency_member: 'Manager',
    agency_viewer: 'Viewer',
    admin: 'Admin',
    manager: 'Manager',
    viewer: 'Viewer',
  };
  return map[role] || role.replace(/^agency_/, '').replace(/_/g, ' ');
}

function initialsFromName(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2)
    return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function mapApiMembersToDisplay(members: TeamMember[]): DisplayMember[] {
  const palette = ['#FF7043', '#007B5F', '#7C3AED', '#FFB74D', '#4DB6AC'];
  return members.map((m, i) => ({
    id: m.id,
    name: m.full_name?.trim() || m.email.split('@')[0],
    email: m.email,
    initials: initialsFromName(m.full_name || '', m.email),
    color: palette[i % palette.length],
    roleKey: m.role,
    status: 'active',
    lastActive: m.created_at && m.created_at !== String(m.id) ? m.created_at : '—',
  }));
}

function ToggleSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
        checked ? 'bg-teal-deep' : 'bg-surface-secondary'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  useRequireAuth();
  const { data: session, status, update: updateSession } = useSession();
  const { data: dashboard, isLoading: dashboardLoading, refresh: refreshDashboard } =
    useDashboard();
  const { members, refresh: refreshMembers } = useMembers();
  const { invites, refresh: refreshInvites } = useInvites();
  const { accessToken, agencyId } = useApiAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('agency');

  const [agencyName, setAgencyName] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [agencyWebsite, setAgencyWebsite] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [agencyTimezone, setAgencyTimezone] = useState('America/New_York');
  const [agencyCurrency, setAgencyCurrency] = useState('USD');
  const [agencySaving, setAgencySaving] = useState(false);
  const [agencyLogoUploading, setAgencyLogoUploading] = useState(false);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteApiRole>('agency_viewer');
  const [inviteSending, setInviteSending] = useState(false);

  const [wlPortalName, setWlPortalName] = useState('');
  const [wlSubdomain, setWlSubdomain] = useState('');
  const [wlPrimary, setWlPrimary] = useState('#007B5F');
  const [wlSecondary, setWlSecondary] = useState('#FF7043');
  const [wlAccent, setWlAccent] = useState('#0F172A');
  const [wlShowKaivoBranding, setWlShowKaivoBranding] = useState(false);
  const [wlShowPerformanceScore, setWlShowPerformanceScore] = useState(true);
  const [wlShowActualSpend, setWlShowActualSpend] = useState(true);
  const [wlShowLeaderboard, setWlShowLeaderboard] = useState(true);
  const [wlShowTrendComparisons, setWlShowTrendComparisons] = useState(true);

  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: 'Confirm', danger: false, onConfirm: () => {} });

  const openConfirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }) => {
      setConfirmDialog({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel || 'Confirm',
        danger: opts.danger ?? false,
        onConfirm: opts.onConfirm,
      });
    },
    [],
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  }, []);

  const isAdmin =
    session?.user?.isSuperuser === true ||
    session?.user?.agencyRole === 'agency_admin';

  const displayMembers = useMemo((): DisplayMember[] => {
    const baseMembers =
      members.length > 0 ? mapApiMembersToDisplay(members) : [];

    if (!invites || invites.length === 0) return baseMembers;

    const palette = ['#FF7043', '#007B5F', '#7C3AED', '#FFB74D', '#4DB6AC'];
    const inviteDisplays: DisplayMember[] = invites.map((invite, index) => {
      const email = invite.email;
      const name = email.split('@')[0];
      return {
        id: Number(`9${invite.id}`), // avoid clashing with member ids
        name,
        email,
        initials: initialsFromName(name, email),
        color: palette[(baseMembers.length + index) % palette.length],
        roleKey: invite.role,
        status: 'invited',
        lastActive: invite.created_at
          ? new Date(invite.created_at).toLocaleDateString()
          : 'Invited',
        inviteId: invite.id,
      };
    });

    return [...baseMembers, ...inviteDisplays];
  }, [members, invites]);

  const matrixCapabilities = useMemo(() => {
    const set = new Set<string>();
    for (const r of MATRIX_ROLES) {
      ROLE_PERMISSIONS[r].capabilities.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, []);

  const tabSubtitle = useMemo(() => {
    const found = TABS.find((t) => t.id === activeTab);
    return found ? `Manage ${found.label}` : undefined;
  }, [activeTab]);

  useEffect(() => {
    if (!dashboard?.agency) return;
    const a = dashboard.agency;
    if (a.name) setAgencyName(a.name);
    if (a.email) setAgencyEmail(a.email);
    if (a.website) setAgencyWebsite(a.website || '');
    if (a.phone) setAgencyPhone(a.phone || '');
    if (a.timezone) setAgencyTimezone(a.timezone);
    if (a.currency) setAgencyCurrency(a.currency);
    setAgencyLogoUrl(a.logo_url ?? null);
  }, [dashboard?.agency]);

  useEffect(() => {
    if (session?.user?.name) setProfileName(session.user.name);
    if (session?.user?.email) setProfileEmail(session.user.email);
    if (session?.user?.image) setProfileAvatarUrl(session.user.image);
  }, [session?.user?.name, session?.user?.email, session?.user?.image]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col h-full bg-cream">
        <div className="h-14 bg-white border-b border-border-subtle animate-pulse" />
        <div className="flex flex-1 p-6 gap-6">
          <div className="w-[210px] bg-white border border-border rounded-[10px] animate-pulse" />
          <div className="flex-1 bg-white border border-border rounded-[10px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') return null;

  async function handleAgencySave() {
    if (!accessToken || !agencyId) {
      toast.error('Missing session');
      return;
    }
    if (!agencyName.trim()) {
      toast.error('Agency name is required');
      return;
    }
    setAgencySaving(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.AGENCY.UPDATE(agencyId),
        {
          name: agencyName.trim(),
          email: agencyEmail.trim() || undefined,
          logo_url: agencyLogoUrl || undefined,
          website: agencyWebsite.trim() || undefined,
          phone: agencyPhone.trim() || undefined,
          timezone: agencyTimezone,
          currency: agencyCurrency,
        },
        { accessToken, agencyId },
      );
      toast.success('Agency profile saved');
      refreshDashboard();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to save agency');
    } finally {
      setAgencySaving(false);
    }
  }

  async function uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `Upload failed (${res.status})`);
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      throw new Error('Upload response did not include a URL');
    }
    return data.url;
  }

  async function handleInvite() {
    if (!accessToken || !agencyId) {
      toast.error('Missing session');
      return;
    }
    if (!inviteEmail.trim()) {
      toast.error('Enter an email address');
      return;
    }
    setInviteSending(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.AGENCY.INVITE(agencyId),
        { email: inviteEmail.trim(), role: inviteRole },
        { accessToken, agencyId },
      );
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      setShowInviteForm(false);
      refreshMembers();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send invite');
    } finally {
      setInviteSending(false);
    }
  }

  async function handleProfileSave() {
    if (!accessToken) {
      toast.error('Missing session');
      return;
    }
    setProfileSaving(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.AUTH.PROFILE,
        {
          full_name: profileName.trim() || undefined,
          avatar_url: profileAvatarUrl || undefined,
        },
        { accessToken, agencyId },
      );
      toast.success('Profile updated');
      await updateSession?.();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  }

  function handlePasswordSave(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error('Fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    toast.success('Password change recorded (configure backend to persist)');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-cream">
      <DashboardHeader
        title="Settings"
        subtitle={tabSubtitle}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <nav
          className="w-[210px] shrink-0 bg-white border-r border-border py-4 px-2 flex flex-col gap-1 overflow-y-auto"
          aria-label="Settings sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-deep text-white'
                  : 'text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {activeTab === 'agency' && (
            <div className="max-w-2xl space-y-6">
              <h2 className={sectionTitle}>Agency Profile</h2>
              <div className="bg-white border border-border rounded-[12px] p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input
                      id="agency-logo-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!isAdmin || agencyLogoUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!isAdmin) {
                          toast.error('Only agency admins can change the logo');
                          return;
                        }
                        try {
                          setAgencyLogoUploading(true);
                          const url = await uploadImage(file);
                          setAgencyLogoUrl(url);
                          toast.success('Logo uploaded. Click Save to apply.');
                        } catch (err) {
                          const msg =
                            err instanceof Error ? err.message : 'Upload failed';
                          toast.error(msg);
                        } finally {
                          setAgencyLogoUploading(false);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="relative w-20 h-20 rounded-full border border-border bg-surface-secondary flex items-center justify-center text-text-muted hover:border-aqua transition-colors overflow-hidden"
                      aria-label="Upload agency logo"
                      onClick={() => {
                        if (!isAdmin) return;
                        const input = document.getElementById(
                          'agency-logo-input',
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      {agencyLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={agencyLogoUrl}
                          alt="Agency logo"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <CameraIcon className="w-8 h-8" />
                      )}
                    </button>
                  </div>
                  <p className="text-[13px] text-text-secondary">
                    Recommended: square PNG or SVG, 256×256. Uploads are stored securely and linked
                    to your agency profile.
                  </p>
                </div>

                <div>
                  <label className={labelClass} htmlFor="agency-name">
                    Agency name
                  </label>
                  <input
                    id="agency-name"
                    className={inputClass}
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    disabled={!isAdmin || dashboardLoading}
                    placeholder="Your agency name"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency-email">
                    Email
                  </label>
                  <input
                    id="agency-email"
                    type="email"
                    className={inputClass}
                    value={agencyEmail}
                    onChange={(e) => setAgencyEmail(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="contact@agency.com"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency-website">
                    Website
                  </label>
                  <input
                    id="agency-website"
                    className={inputClass}
                    value={agencyWebsite}
                    onChange={(e) => setAgencyWebsite(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency-phone">
                    Phone
                  </label>
                  <input
                    id="agency-phone"
                    className={inputClass}
                    value={agencyPhone}
                    onChange={(e) => setAgencyPhone(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="+1 …"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass} htmlFor="agency-tz">
                      Timezone
                    </label>
                    <select
                      id="agency-tz"
                      className={inputClass}
                      value={agencyTimezone}
                      onChange={(e) => setAgencyTimezone(e.target.value)}
                      disabled={!isAdmin}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="agency-currency">
                      Currency
                    </label>
                    <select
                      id="agency-currency"
                      className={inputClass}
                      value={agencyCurrency}
                      onChange={(e) => setAgencyCurrency(e.target.value)}
                      disabled={!isAdmin}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={handleAgencySave}
                    disabled={agencySaving || dashboardLoading}
                  >
                    {agencySaving ? 'Saving…' : 'Save'}
                  </button>
                )}
                {!isAdmin && (
                  <p className="text-[12px] text-text-muted">
                    Only agency admins can edit organization details.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-6 max-w-5xl">
            <div className="space-y-2">
              <h2 className={sectionTitle}>Team &amp; Access</h2>
              <p className="text-[12.5px] text-text-muted">
                Manage who can access your agency portal and what they can do. Pending invites are
                shown alongside active members.
              </p>
            </div>

            <div className="bg-white border border-border rounded-[12px] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                <div>
                  <p className="text-[13px] font-bold text-text-primary">Team members</p>
                  <p className="text-[11px] text-text-muted font-medium mt-0.5">
                    {members.length > 0
                      ? `${members.length} active member${members.length === 1 ? '' : 's'}`
                      : 'Using sample team data until members are added'}
                  </p>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    className={`${btnPrimary} h-[34px] text-[12px] px-3`}
                    onClick={() => setShowInviteForm(true)}
                  >
                    Invite member
                  </button>
                ) : (
                  <p className="text-[11px] text-text-muted">
                    Only admins can invite or remove team members.
                  </p>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-secondary/50 text-[10.5px] font-semibold text-text-muted uppercase tracking-wider">
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last active</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMembers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-4 text-[12px] text-text-muted text-center"
                        >
                          No team members yet. Use “Invite member” to add your first teammate.
                        </td>
                      </tr>
                    )}
                    {displayMembers.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                              style={{ backgroundColor: row.color }}
                            >
                              {row.initials}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-primary">
                                {row.name}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {row.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const isSelf =
                              row.status === 'active' &&
                              members.find((m) => m.email === row.email)?.user_id ===
                                Number(session?.user?.id);
                            if (isAdmin && row.status === 'active' && !isSelf) {
                              return (
                                <select
                                  className="text-[11px] font-semibold px-2 py-1 border border-border rounded-[6px] bg-white focus:outline-none focus:border-teal-deep"
                                  value={row.roleKey}
                                  onChange={(e) => {
                                    const newRole = e.target.value;
                                    if (newRole === row.roleKey) return;
                                    const selectEl = e.target;
                                    selectEl.value = row.roleKey;
                                    openConfirm({
                                      title: 'Change role',
                                      message: `Change ${row.name}'s role to ${formatRoleDisplay(newRole)}?`,
                                      confirmLabel: 'Change role',
                                      onConfirm: async () => {
                                        closeConfirm();
                                        const member = members.find((m) => m.email === row.email);
                                        if (!member) return;
                                        try {
                                          await apiClient.patch(
                                            API_ENDPOINTS.AGENCY.UPDATE_MEMBER_ROLE(
                                              agencyId!,
                                              member.id,
                                            ),
                                            { role: newRole },
                                            { accessToken, agencyId },
                                          );
                                          toast.success(`Role updated to ${formatRoleDisplay(newRole)}`);
                                          refreshMembers();
                                        } catch (err: unknown) {
                                          toast.error(
                                            (err as { message?: string })?.message ||
                                              'Failed to update role',
                                          );
                                        }
                                      },
                                    });
                                  }}
                                >
                                  <option value="agency_admin">Admin</option>
                                  <option value="agency_member">Manager</option>
                                  <option value="agency_viewer">Viewer</option>
                                </select>
                              );
                            }
                            return (
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-[6px] text-[11px] font-semibold capitalize ${roleBadgeClass(
                                  formatRoleDisplay(row.roleKey),
                                )}`}
                              >
                                {formatRoleDisplay(row.roleKey)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-[6px] text-[11px] font-semibold capitalize ${statusBadgeClass(
                              row.status,
                            )}`}
                          >
                            {row.status === 'invited' ? 'Invited' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-muted">
                          {row.lastActive}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            const isSelf =
                              row.status === 'active' &&
                              members.find((m) => m.email === row.email)?.user_id ===
                                Number(session?.user?.id);
                            if (isSelf) {
                              return (
                                <button
                                  type="button"
                                  className="px-3 py-1 rounded-[6px] border border-border text-[11px] font-semibold text-text-muted opacity-40 cursor-default"
                                  disabled
                                >
                                  You
                                </button>
                              );
                            }
                            if (isAdmin && row.status === 'active') {
                              return (
                                <button
                                  type="button"
                                  className="px-3 py-1 rounded-[6px] border border-red text-[11px] font-semibold text-red hover:bg-red-light transition-colors"
                                  onClick={() => {
                                    const member = members.find((m) => m.email === row.email);
                                    if (!member) return;
                                    openConfirm({
                                      title: 'Remove team member',
                                      message: `Remove ${row.name} from your team? They will lose access immediately.`,
                                      confirmLabel: 'Remove',
                                      danger: true,
                                      onConfirm: async () => {
                                        closeConfirm();
                                        try {
                                          await apiClient.delete(
                                            API_ENDPOINTS.AGENCY.REMOVE_MEMBER(
                                              agencyId!,
                                              member.id,
                                            ),
                                            { accessToken, agencyId },
                                          );
                                          toast.success('Member removed');
                                          refreshMembers();
                                        } catch (err: unknown) {
                                          toast.error(
                                            (err as { message?: string })?.message ||
                                              'Failed to remove member',
                                          );
                                        }
                                      },
                                    });
                                  }}
                                >
                                  Remove
                                </button>
                              );
                            }
                            if (isAdmin && row.status === 'invited') {
                              return (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    className="px-3 py-1 rounded-[6px] border border-border text-[11px] font-semibold text-text-secondary hover:bg-surface-secondary transition-colors"
                                    onClick={async () => {
                                      try {
                                        await apiClient.post(
                                          API_ENDPOINTS.AGENCY.INVITE(agencyId!),
                                          { email: row.email, role: row.roleKey },
                                          { accessToken, agencyId },
                                        );
                                        toast.success(`Invite resent to ${row.name}`);
                                      } catch (err: unknown) {
                                        toast.error(
                                          (err as { message?: string })?.message ||
                                            'Failed to resend invite',
                                        );
                                      }
                                    }}
                                  >
                                    Resend
                                  </button>
                                  <button
                                    type="button"
                                    className="px-3 py-1 rounded-[6px] border border-red text-[11px] font-semibold text-red hover:bg-red-light transition-colors"
                                    onClick={() => {
                                      if (!row.inviteId) return;
                                      const invId = row.inviteId;
                                      openConfirm({
                                        title: 'Revoke invite',
                                        message: `Revoke the invite for ${row.name}? They will no longer be able to join using this link.`,
                                        confirmLabel: 'Revoke',
                                        danger: true,
                                        onConfirm: async () => {
                                          closeConfirm();
                                          try {
                                            await apiClient.delete(
                                              API_ENDPOINTS.AGENCY.CANCEL_INVITE(
                                                agencyId!,
                                                invId,
                                              ),
                                              { accessToken, agencyId },
                                            );
                                            toast.success('Invite revoked');
                                            refreshInvites();
                                          } catch (err: unknown) {
                                            toast.error(
                                              (err as { message?: string })?.message ||
                                                'Failed to revoke invite',
                                            );
                                          }
                                        },
                                      });
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showInviteForm && isAdmin && (
                <div className="border-t border-border-subtle bg-surface-secondary/40 px-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className={labelClass} htmlFor="invite-email">
                        Email address
                      </label>
                      <input
                        id="invite-email"
                        type="email"
                        className={inputClass}
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@agency.com"
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="invite-role">
                        Role
                      </label>
                      <select
                        id="invite-role"
                        className={inputClass}
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as InviteApiRole)
                        }
                      >
                        <option value="agency_admin">Admin</option>
                        <option value="agency_member">Manager</option>
                        <option value="agency_viewer">Viewer</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      className="px-3 h-[34px] rounded-[10px] border border-border text-[12px] font-semibold text-text-muted hover:bg-surface-secondary transition-colors"
                      onClick={() => {
                        setShowInviteForm(false);
                        setInviteEmail('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${btnPrimary} h-[34px] text-[12px] px-3`}
                      onClick={async () => {
                        await handleInvite();
                        refreshInvites();
                      }}
                      disabled={inviteSending}
                    >
                      {inviteSending ? 'Sending…' : 'Send invite'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
                <h3 className={`${sectionTitle} mb-3`}>
                  Role permissions
                </h3>
                <div className="bg-white border border-border rounded-[12px] overflow-x-auto">
                  <table className="w-full text-[12px] min-w-[640px]">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-secondary/50">
                        <th className="px-3 py-2 text-left font-bold text-text-primary">
                          Capability
                        </th>
                        {MATRIX_ROLES.map((r) => (
                          <th
                            key={r}
                            className="px-3 py-2 text-center font-bold text-text-primary"
                          >
                            {r === 'agency_admin'
                              ? 'Admin'
                              : r === 'agency_manager'
                                ? 'Manager'
                                : 'Viewer'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixCapabilities.map((cap) => (
                        <tr
                          key={cap}
                          className="border-b border-border"
                        >
                          <td className="px-3 py-2 text-text-secondary">
                            {cap}
                          </td>
                          {MATRIX_ROLES.map((r) => (
                            <td key={r} className="px-3 py-2 text-center">
                              {ROLE_PERMISSIONS[r].capabilities.includes(
                                cap,
                              ) ? (
                                <span className="text-teal-deep font-semibold" aria-label="Yes">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-text-muted" aria-label="No">
                                  —
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'whitelabel' && (
            <div className="max-w-2xl space-y-6">
              <h2 className={sectionTitle}>White-label</h2>
              <div className="bg-white border border-border rounded-[12px] p-6 space-y-5">
                <div>
                  <label className={labelClass} htmlFor="wl-name">
                    Portal name
                  </label>
                  <input
                    id="wl-name"
                    className={inputClass}
                    value={wlPortalName}
                    onChange={(e) => setWlPortalName(e.target.value)}
                    placeholder="Client portal title"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="relative w-20 h-20 rounded-full border border-border bg-surface-secondary flex items-center justify-center text-text-muted"
                    aria-label="Upload brand logo"
                  >
                    <CameraIcon className="w-8 h-8" />
                  </button>
                  <p className="text-[13px] text-text-secondary">
                    Preview only — not saved to the server.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Primary', value: wlPrimary, set: setWlPrimary },
                    {
                      label: 'Secondary',
                      value: wlSecondary,
                      set: setWlSecondary,
                    },
                    { label: 'Accent', value: wlAccent, set: setWlAccent },
                  ].map((c) => (
                    <div key={c.label}>
                      <label className={labelClass}>{c.label}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${c.label} brand color`}
                          className="h-[44px] w-14 p-1 border border-border rounded-[10px] bg-surface-secondary cursor-pointer"
                          value={c.value}
                          onChange={(e) => c.set(e.target.value)}
                        />
                        <span className="text-[12px] font-mono text-text-muted">
                          {c.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className={labelClass} htmlFor="wl-sub">
                    Subdomain
                  </label>
                  <input
                    id="wl-sub"
                    className={inputClass}
                    value={wlSubdomain}
                    onChange={(e) => setWlSubdomain(e.target.value)}
                    placeholder="your-agency"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Mock: {wlSubdomain || 'your-agency'}.clients.kaivo.app
                  </p>
                </div>
                <div className="space-y-3">
                  <p className="text-[12.5px] font-semibold text-text-primary">
                    Client view
                  </p>
                  {[
                    {
                      id: 'wl-kaivo-brand',
                      label: 'Show Kaivo branding',
                      checked: wlShowKaivoBranding,
                      onChange: setWlShowKaivoBranding,
                    },
                    {
                      id: 'wl-score',
                      label: 'Show performance score',
                      checked: wlShowPerformanceScore,
                      onChange: setWlShowPerformanceScore,
                    },
                    {
                      id: 'wl-spend',
                      label: 'Show actual spend',
                      checked: wlShowActualSpend,
                      onChange: setWlShowActualSpend,
                    },
                    {
                      id: 'wl-leaderboard',
                      label: 'Show campaign leaderboard',
                      checked: wlShowLeaderboard,
                      onChange: setWlShowLeaderboard,
                    },
                    {
                      id: 'wl-trends',
                      label: 'Show trend comparisons',
                      checked: wlShowTrendComparisons,
                      onChange: setWlShowTrendComparisons,
                    },
                  ].map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border"
                    >
                      <label
                        htmlFor={t.id}
                        className="text-[13px] text-text-secondary cursor-pointer flex-1"
                      >
                        {t.label}
                      </label>
                      <ToggleSwitch
                        id={t.id}
                        checked={t.checked}
                        onChange={t.onChange}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-text-muted">
                  White-label options are stored locally in this session only.
                </p>
              </div>
            </div>
          )}


          {activeTab === 'account' && (
            <div className="max-w-xl space-y-6">
              <h2 className={sectionTitle}>Account</h2>
              <div className="bg-white border border-border rounded-[12px] p-6 space-y-4">
                <div>
                  <label className={labelClass}>Owner email</label>
                  <input
                    className={`${inputClass} opacity-80 cursor-not-allowed`}
                    readOnly
                    value={session?.user?.email || ''}
                  />
                </div>
                <div>
                  <label className={labelClass}>Account ID</label>
                  <input
                    className={`${inputClass} opacity-80 cursor-not-allowed font-mono`}
                    readOnly
                    value={agencyId || '—'}
                  />
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={() =>
                      toast.success('Export queued (mock — no file generated)')
                    }
                  >
                    Export Data
                  </button>
                </div>
                <button
                  type="button"
                  className="text-[13px] font-semibold text-red hover:underline"
                  onClick={() =>
                    toast.message('Close account', {
                      description: 'This is a mock action. Contact support to close your account.',
                    })
                  }
                >
                  Close Account
                </button>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="max-w-xl space-y-6">
              <h2 className={sectionTitle}>My Profile</h2>
              <div className="bg-white border border-border rounded-[12px] p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input
                      id="profile-avatar-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await uploadImage(file);
                          setProfileAvatarUrl(url);
                          toast.success(
                            'Profile photo uploaded. Click Save profile to apply.',
                          );
                        } catch (err) {
                          const msg =
                            err instanceof Error ? err.message : 'Upload failed';
                          toast.error(msg);
                        } finally {
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="relative w-20 h-20 rounded-full border border-border bg-surface-secondary flex items-center justify-center text-text-muted overflow-hidden"
                      aria-label="Upload profile photo"
                      onClick={() => {
                        const input = document.getElementById(
                          'profile-avatar-input',
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      {profileAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profileAvatarUrl}
                          alt="Profile avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <CameraIcon className="w-8 h-8" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="prof-name">
                    Name
                  </label>
                  <input
                    id="prof-name"
                    className={inputClass}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="prof-email">
                    Email
                  </label>
                  <input
                    id="prof-email"
                    type="email"
                    className={`${inputClass} opacity-80 cursor-not-allowed`}
                    readOnly
                    value={profileEmail}
                  />
                </div>
                <div>
                  <label className={labelClass}>Role</label>
                  <input
                    className={`${inputClass} opacity-80 cursor-not-allowed capitalize`}
                    readOnly
                    value={formatRoleDisplay(session?.user?.agencyRole || '—')}
                  />
                </div>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                >
                  {profileSaving ? 'Saving…' : 'Save profile'}
                </button>

                <div className="border-t border-border pt-5 mt-2 space-y-4">
                  <p className="text-[14px] font-bold text-text-primary">
                    Password
                  </p>
                  <form onSubmit={handlePasswordSave} className="space-y-4">
                    <div>
                      <label className={labelClass} htmlFor="pw-current">
                        Current password
                      </label>
                      <input
                        id="pw-current"
                        type="password"
                        autoComplete="current-password"
                        className={inputClass}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="pw-new">
                        New password
                      </label>
                      <input
                        id="pw-new"
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="pw-confirm">
                        Confirm new password
                      </label>
                      <input
                        id="pw-confirm"
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    <button type="submit" className={btnPrimary}>
                      Update password
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
