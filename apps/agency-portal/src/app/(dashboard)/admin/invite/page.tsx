'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Loader2, Send, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const INVITE_ROLES = [
  { value: 'agency_admin', label: 'Admin', description: 'Full access to all agency features and team management' },
  { value: 'agency_viewer', label: 'Viewer', description: 'Read-only access to dashboards and reports' },
] as const;

type InviteRole = typeof INVITE_ROLES[number]['value'];

interface Agency {
  id: number;
  name: string;
  current_plan: string;
}

interface Invite {
  id: number;
  email: string;
  role: string;
  agency_id: number | null;
  agency_name: string | null;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string | null;
  used_at: string | null;
}

export default function AdminInvitePage() {
  const router = useRouter();
  useRequireAuth();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('agency_viewer');
  const [agencyId, setAgencyId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoading, setAgenciesLoading] = useState(true);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);

  const accessToken = session?.accessToken || session?.user?.accessToken;
  const isSuperuser = session?.user?.isSuperuser === true;

  const fetchAgencies = useCallback(async () => {
    if (!accessToken) return;
    setAgenciesLoading(true);
    try {
      const data = await apiClient.get<Agency[]>(API_ENDPOINTS.ADMIN.AGENCIES, { accessToken });
      setAgencies(data);
    } catch {
      toast.error('Failed to load agencies');
    } finally {
      setAgenciesLoading(false);
    }
  }, [accessToken]);

  const fetchInvites = useCallback(async () => {
    if (!accessToken) return;
    setInvitesLoading(true);
    try {
      const data = await apiClient.get<Invite[]>(API_ENDPOINTS.ADMIN.INVITES, { accessToken });
      setInvites(data);
    } catch {
      toast.error('Failed to load invites');
    } finally {
      setInvitesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isSuperuser && accessToken) {
      fetchAgencies();
      fetchInvites();
    }
  }, [isSuperuser, accessToken, fetchAgencies, fetchInvites]);

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isSuperuser) {
      router.replace('/');
    }
  }, [status, session?.user?.isSuperuser, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (status !== 'authenticated') return null;
  if (!isSuperuser) return null;

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !accessToken) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSending(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.ADMIN.INVITE,
        {
          email: email.trim(),
          role,
          agency_id: agencyId ? Number(agencyId) : null,
        },
        { accessToken },
      );
      toast.success(`Invite sent to ${email}`);
      setEmail('');
      fetchInvites();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  async function handleResend(inviteEmail: string) {
    if (!accessToken) return;
    setResendingId(inviteEmail);
    try {
      await apiClient.post(
        API_ENDPOINTS.ADMIN.RESEND_INVITE,
        { email: inviteEmail },
        { accessToken },
      );
      toast.success(`New invite sent to ${inviteEmail}`);
      fetchInvites();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to resend invite');
    } finally {
      setResendingId(null);
    }
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      expired: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={cn('text-[11px] px-2.5 py-0.5 rounded-full font-semibold border capitalize', colors[s] || 'bg-gray-100 text-gray-600 border-gray-200')}>
        {s}
      </span>
    );
  };

  const roleBadge = (r: string) => {
    const colors: Record<string, string> = {
      agency_admin: 'bg-teal/10 text-teal border-teal/20',
      agency_viewer: 'bg-blue-100 text-blue-600 border-blue-200',
      agency_member: 'bg-purple-100 text-purple-600 border-purple-200',
    };
    const labels: Record<string, string> = {
      agency_admin: 'Admin',
      agency_viewer: 'Viewer',
      agency_member: 'Member',
    };
    return (
      <span className={cn('text-[11px] px-2.5 py-0.5 rounded-full font-semibold border', colors[r] || 'bg-gray-100 text-gray-600 border-gray-200')}>
        {labels[r] || r}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-teal" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Admin Invites</h1>
        </div>
        <p className="text-text-muted text-sm font-medium">
          Send magic link invitations to onboard new users to the Kaivo Agency Portal.
        </p>
      </div>

      {/* Invite Form */}
      <div className="bg-white rounded-2xl border-2 border-cream-border p-6">
        <h2 className="text-lg font-bold text-text-primary mb-5 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-teal" />
          Send New Invite
        </h2>
        <form onSubmit={handleSendInvite} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-text-secondary tracking-wide">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@agency.com"
                className="py-[10px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-text-secondary tracking-wide">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                className="py-[10px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white focus:outline-none focus:border-teal transition-colors appearance-none"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                ))}
              </select>
            </div>

            {/* Agency */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-text-secondary tracking-wide">Agency (optional)</label>
              <select
                value={agencyId}
                onChange={(e) => setAgencyId(e.target.value)}
                disabled={agenciesLoading}
                className="py-[10px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white focus:outline-none focus:border-teal transition-colors appearance-none disabled:opacity-50"
              >
                <option value="">No agency</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.current_plan})</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={!email.trim() || sending}
            className="flex items-center gap-2 px-6 py-[11px] rounded-[10px] bg-teal text-white font-bold text-[14px] hover:bg-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Invite
          </button>
        </form>
      </div>

      {/* Invite History */}
      <div className="bg-white rounded-2xl border-2 border-cream-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-primary">Invite History</h2>
          <button
            onClick={fetchInvites}
            disabled={invitesLoading}
            className="flex items-center gap-1.5 text-[12px] font-bold text-text-muted hover:text-teal transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', invitesLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {invitesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-cream/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted text-sm font-medium">No invites sent yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-cream-border">
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3 pr-4">Email</th>
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3 pr-4">Role</th>
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3 pr-4">Agency</th>
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3 pr-4">Status</th>
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3 pr-4">Sent</th>
                  <th className="text-[11px] font-bold text-text-secondary tracking-wide py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-cream-border/50 last:border-0">
                    <td className="py-3 pr-4 text-[13px] font-medium text-text-primary">{inv.email}</td>
                    <td className="py-3 pr-4">{roleBadge(inv.role)}</td>
                    <td className="py-3 pr-4 text-[13px] text-text-muted">{inv.agency_name || '—'}</td>
                    <td className="py-3 pr-4">{statusBadge(inv.status)}</td>
                    <td className="py-3 pr-4 text-[12px] text-text-muted">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="py-3">
                      {inv.status === 'pending' || inv.status === 'expired' ? (
                        <button
                          onClick={() => handleResend(inv.email)}
                          disabled={resendingId === inv.email}
                          className="flex items-center gap-1.5 text-[12px] font-bold text-teal hover:text-teal-dark transition-colors disabled:opacity-50"
                        >
                          {resendingId === inv.email ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Resend
                        </button>
                      ) : (
                        <span className="text-[12px] text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
