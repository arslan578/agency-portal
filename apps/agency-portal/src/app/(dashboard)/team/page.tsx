'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  UserPlus, Trash2, Mail, Loader2, ShieldCheck, Users, X, Clock,
} from 'lucide-react';
import { useMembers, useInvites, useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { AGENCY_ROLES, type AgencyRole } from '@/lib/api/contracts';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorDisplay } from '@/components/ui/ErrorDisplay';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TeamPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const { members, error: membersError, isLoading: membersLoading, refresh: refreshMembers } = useMembers();
  const { invites, error: invitesError, isLoading: invitesLoading, refresh: refreshInvites } = useInvites();
  const { accessToken, agencyId } = useApiAuth();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AgencyRole>('agency_viewer');
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  if (status === 'loading') return <TeamSkeleton />;
  if (status !== 'authenticated') return null;

  const isAdmin =
    session?.user?.isSuperuser === true ||
    session?.user?.agencyRole === 'agency_admin';

  async function handleInvite() {
    if (!inviteEmail.trim() || !accessToken || !agencyId) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSending(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        invite_link?: string;
        email_sent?: boolean;
        message?: string;
      }>(
        API_ENDPOINTS.AGENCY.INVITE(agencyId),
        { email: inviteEmail, role: inviteRole },
        { accessToken, agencyId },
      );

      if (res.email_sent) {
        toast.success(`Invitation emailed to ${inviteEmail}`);
      } else if (res.invite_link) {
        toast.success('Invitation created — copy the link from the API response/logs if needed.');
      } else {
        toast.success(`Invitation created for ${inviteEmail}`);
      }

      setInviteEmail('');
      setShowInvite(false);
      refreshInvites();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  async function handleRemoveMember(memberId: number) {
    if (!accessToken || !agencyId) return;
    setRemovingId(memberId);
    try {
      await apiClient.delete(
        API_ENDPOINTS.AGENCY.REMOVE_MEMBER(agencyId, memberId),
        { accessToken, agencyId },
      );
      toast.success('Member removed');
      refreshMembers();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCancelInvite(inviteId: number) {
    if (!accessToken || !agencyId) return;
    setCancellingId(inviteId);
    try {
      await apiClient.delete(
        API_ENDPOINTS.AGENCY.CANCEL_INVITE(agencyId, inviteId),
        { accessToken, agencyId },
      );
      toast.success('Invite cancelled');
      refreshInvites();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to cancel invite');
    } finally {
      setCancellingId(null);
    }
  }

  function getRoleBadge(role: string) {
    const r = AGENCY_ROLES[role as AgencyRole];
    const label = r?.label || role;
    const colors: Record<string, string> = {
      agency_admin: 'bg-teal-deep/10 text-teal-deep border-teal-deep/20',
      agency_manager: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
      agency_viewer: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    };
    return (
      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold border", colors[role] || 'bg-muted text-text-muted border-border')}>
        {label}
      </span>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Team</h1>
          <p className="text-text-muted mt-1">
            Manage your agency team members
            {members.length > 0 && <span className="ml-2 text-xs bg-teal-deep/10 text-teal-deep px-2 py-0.5 rounded-full font-semibold">{members.length} members</span>}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-deep text-white text-sm font-semibold hover:bg-teal-deep/90 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </button>
        )}
      </div>

      {membersError && <ErrorDisplay message={membersError?.message || 'Could not load team members'} onRetry={() => refreshMembers()} />}

      {membersLoading ? (
        <TeamSkeleton />
      ) : !membersError && members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members"
          description="You're the only one here. Invite team members to collaborate on client management."
          action={isAdmin ? (
            <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-deep text-white text-sm font-semibold hover:bg-teal-deep/90 transition-colors">
              <UserPlus className="h-4 w-4" />
              Invite First Member
            </button>
          ) : undefined}
        />
      ) : !membersError && (
        <div className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="glass-card rounded-xl border px-5 py-4 flex items-center gap-4 group">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-deep/30 to-teal-deep/30 flex items-center justify-center shrink-0 border border-border">
                <span className="text-sm font-bold text-teal-deep uppercase">
                  {(member.full_name || member.email).charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary truncate">{member.full_name || 'Unnamed'}</p>
                  {getRoleBadge(member.role)}
                </div>
                <p className="text-xs text-text-muted truncate mt-0.5">{member.email}</p>
              </div>
              {isAdmin && member.user_id !== Number(session?.user?.id) && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={removingId === member.id}
                  className="px-3 py-1.5 text-xs rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {removingId === member.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && invites.length > 0 && (
        <div className="pt-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Pending Invites
          </h2>
          <div className="space-y-2">
                {invites.map(invite => (
              <div key={invite.id} className="rounded-xl border border-dashed border-border bg-white/[0.02] px-5 py-3 flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{invite.email}</p>
                  <p className="text-[10px] text-text-muted">
                    Invited as {AGENCY_ROLES[invite.role as AgencyRole]?.label || invite.role}
                    {invite.expires_at && (
                      <> · Expires on {new Date(invite.expires_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleCancelInvite(invite.id)}
                  disabled={cancellingId === invite.id}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {cancellingId === invite.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="glass-card rounded-2xl border w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Invite Team Member</h2>
              <button onClick={() => setShowInvite(false)} className="h-8 w-8 rounded-lg hover:bg-surface-secondary flex items-center justify-center text-text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Email Address *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@agency.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-teal-deep/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Role</label>
                <div className="space-y-2">
                  {(Object.entries(AGENCY_ROLES) as [AgencyRole, typeof AGENCY_ROLES[AgencyRole]][]).map(([key, val]) => (
                    <label
                      key={key}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                        inviteRole === key ? "border-teal-deep/30 bg-teal-deep/5" : "border-border hover:border-aqua/40"
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={key}
                        checked={inviteRole === key}
                        onChange={() => setInviteRole(key)}
                        className="mt-0.5 accent-teal-deep"
                      />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{val.label}</p>
                        <p className="text-xs text-text-muted">{val.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => setShowInvite(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-surface-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || sending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-teal-deep text-white text-sm font-semibold hover:bg-teal-deep/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="glass-card rounded-xl border px-5 py-4 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
