'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
    Users, 
    Plus, 
    Crown, 
    Shield, 
    Eye, 
    Trash2, 
    Settings, 
    Building2, 
    CreditCard,
    Mail,
    ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgency } from '@/context/AgencyContext';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface TeamMember {
    id: number;
    user_id: number;
    email: string;
    full_name: string | null;
    role: string;
}

const ROLE_CONFIG = {
    agency_admin: { icon: Crown, label: 'Admin', color: 'text-amber-300 bg-amber-400/20 border border-amber-400/30' },
    agency_manager: { icon: Shield, label: 'Manager', color: 'text-blue-300 bg-blue-400/20 border border-blue-400/30' },
    agency_viewer: { icon: Eye, label: 'Viewer', color: 'text-slate-300 bg-white/15 border border-border' },
};

export default function AgencySettingsPage() {
    const { agency, agencyId, credits, tier, role, refreshAgency } = useAgency();
    const { user } = useAuth();
    
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('agency_viewer');
    const [inviting, setInviting] = useState(false);
    const [agencyName, setAgencyName] = useState('');
    const [saving, setSaving] = useState(false);

    const isAdmin = role === 'agency_admin' || !role;

    const tierLabels: Record<string, string> = {
        'free': 'Free Forever',
        'starter': 'Starter',
        'growth': 'Growth',
        'scale': 'Scale',
        'enterprise': 'Enterprise',
        '0': 'Free Forever',
        '1': 'Starter',
        '2': 'Growth',
        '3': 'Scale',
        '4': 'Enterprise'
    };

    useEffect(() => {
        if (agency?.name) {
            setAgencyName(agency.name);
        }
    }, [agency]);

    useEffect(() => {
        const fetchMembers = async () => {
            if (!agencyId) {
                if (user) {
                    setMembers([{
                        id: 1,
                        user_id: user.id,
                        email: user.email,
                        full_name: user.full_name || null,
                        role: 'agency_admin'
                    }]);
                }
                return;
            }
            
            setLoadingMembers(true);
            try {
                const res = await apiClient.get<TeamMember[]>(`/agencies/${agencyId}/members`);
                setMembers(Array.isArray(res) ? res : []);
            } catch (error) {
                console.error('Failed to fetch members:', error);
                if (user) {
                    setMembers([{
                        id: 1,
                        user_id: user.id,
                        email: user.email,
                        full_name: user.full_name || null,
                        role: role || 'agency_admin'
                    }]);
                }
            } finally {
                setLoadingMembers(false);
            }
        };
        
        fetchMembers();
    }, [agencyId, user, role]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) {
            toast.error('Please enter an email address');
            return;
        }
        if (!agencyId) {
            toast.error('Agency not found');
            return;
        }

        setInviting(true);
        try {
            const res = await apiClient.post<{
                success: boolean;
                message: string;
                invite_link?: string;
            }>(`/agencies/${agencyId}/invite`, {
                email: inviteEmail,
                role: inviteRole
            });
            
            toast.success(res.message || `Invitation sent to ${inviteEmail}`);
            setInviteEmail('');
            
            if (res.invite_link) {
                toast.info(
                    `Invite link copied! Share with ${inviteEmail}`,
                    { duration: 8000 }
                );
                navigator.clipboard?.writeText(res.invite_link);
            }
            
            const membersRes = await apiClient.get<TeamMember[]>(`/agencies/${agencyId}/members`);
            setMembers(Array.isArray(membersRes) ? membersRes : []);
        } catch (error: any) {
            toast.error(error.message || error.detail || 'Failed to send invitation');
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (memberId: number, memberEmail: string) => {
        if (!agencyId) return;
        
        try {
            await apiClient.delete(`/agencies/${agencyId}/members/${memberId}`);
            setMembers(prev => prev.filter(m => m.id !== memberId));
            toast.success(`Removed ${memberEmail} from agency`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to remove member');
        }
    };

    const handleSaveAgency = async () => {
        if (!agencyId || !agencyName.trim()) {
            toast.error('Agency name cannot be empty');
            return;
        }
        
        setSaving(true);
        try {
            await apiClient.patch(`/agencies/${agencyId}`, { name: agencyName });
            toast.success('Agency name updated');
            refreshAgency();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/agency/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <h1 className="text-2xl font-bold text-foreground">Agency Settings</h1>
                    </div>
                    <p className="text-foreground/80">
                        Manage your agency profile and team members
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-lg bg-primary/10">
                                <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm text-foreground/70">Agency</p>
                                <p className="text-lg font-semibold text-foreground">{agency?.name || agencyName || 'My Agency'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-lg bg-purple-500/10">
                                <CreditCard className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-sm text-foreground/70">Current Plan</p>
                                <p className="text-lg font-semibold text-foreground">{tierLabels[tier] || 'Free Forever'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-lg bg-green-500/10">
                                <Users className="h-5 w-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-foreground/70">Team Members</p>
                                <p className="text-lg font-semibold text-foreground">{members.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* General Settings */}
            <Card className="bg-card/50 border-border">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                        <Settings className="h-5 w-5 text-foreground/70" />
                        General Settings
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div>
                        <label className="block text-sm font-medium text-foreground/90 mb-2">
                            Agency Name
                        </label>
                        <div className="flex gap-3">
                            <Input
                                value={agencyName}
                                onChange={(e) => setAgencyName(e.target.value)}
                                placeholder="Enter agency name"
                                className="flex-1"
                                disabled={!isAdmin}
                            />
                            {isAdmin && (
                                <Button 
                                    onClick={handleSaveAgency}
                                    disabled={saving || !agencyName.trim()}
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Team Members */}
            <Card className="bg-card/50 border-border">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                        <Users className="h-5 w-5 text-foreground/70" />
                        Team Members
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Invite Form */}
                    {isAdmin && (
                        <form onSubmit={handleInvite} className="flex gap-3 p-4 rounded-lg bg-white/[0.08] border border-border">
                            <div className="flex-1">
                                <Input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="Enter email to invite"
                                    className="w-full"
                                />
                            </div>
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className="px-3 py-2 rounded-md bg-accent border border-border text-sm text-foreground"
                            >
                                <option value="agency_viewer">Viewer</option>
                                <option value="agency_manager">Manager</option>
                                <option value="agency_admin">Admin</option>
                            </select>
                            <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                                <Plus className="h-4 w-4 mr-2" />
                                {inviting ? 'Inviting...' : 'Invite'}
                            </Button>
                        </form>
                    )}

                    {/* Members List */}
                    {loadingMembers ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kaivo-teal-neon mx-auto mb-4"></div>
                            <p className="text-foreground/80">Loading team members...</p>
                        </div>
                    ) : members.length === 0 ? (
                        <div className="text-center py-8 text-foreground/70">
                            No team members found
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {members.map((member) => {
                                const config = ROLE_CONFIG[member.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.agency_viewer;
                                const RoleIcon = config.icon;
                                const isCurrentUser = member.user_id === user?.id;
                                
                                return (
                                    <div
                                        key={member.id}
                                        className="flex items-center justify-between p-4 rounded-lg bg-white/[0.08] border border-border"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                                                {(member.full_name?.charAt(0) || member.email.charAt(0)).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground flex items-center gap-2">
                                                    {member.full_name || member.email.split('@')[0]}
                                                    {isCurrentUser && (
                                                        <span className="text-xs text-primary font-medium">(you)</span>
                                                    )}
                                                </p>
                                                <p className="text-sm text-foreground/85 mt-0.5">{member.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={cn('px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5', config.color)}>
                                                <RoleIcon className="h-3 w-3" />
                                                {config.label}
                                            </span>
                                            {isAdmin && !isCurrentUser && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.id, member.email)}
                                                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                                    title="Remove member"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
