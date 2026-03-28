'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog';
import {
    Users2,
    Plus,
    Globe,
    Briefcase,
    ArrowLeft,
    Pencil,
    Trash2,
    Monitor,
    BarChart3,
} from 'lucide-react';
import { useAgency } from '@/context/AgencyContext';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface Client {
    id: number;
    agency_id: number;
    name: string;
    industry: string | null;
    website: string | null;
    markup_percent: string | number;
    is_active: boolean;
    account_mode?: string;
}

export default function AgencyClientsPage() {
    const { agencyId, agency, refreshAgency } = useAgency();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        name: '',
        industry: '',
        website: '',
        is_active: true,
        account_mode: 'kaivo_managed' as string,
    });

    const fetchClients = async () => {
        if (!agencyId) {
            setClients([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await apiClient.get<Client[]>(`/agency/${agencyId}/clients`);
            setClients(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error('Failed to fetch clients:', error);
            setClients([]);
            toast.error('Failed to load clients');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, [agencyId]);

    const resetForm = () => {
        setForm({
            name: '',
            industry: '',
            website: '',
            is_active: true,
            account_mode: 'kaivo_managed',
        });
        setSelectedClient(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agencyId || !form.name.trim()) {
            toast.error('Client name is required');
            return;
        }
        setSubmitting(true);
        try {
            await apiClient.post(`/agency/${agencyId}/clients`, {
                name: form.name.trim(),
                industry: form.industry.trim() || undefined,
                website: form.website.trim() || undefined,
                is_active: form.is_active,
                account_mode: form.account_mode,
            });
            toast.success('Client created');
            setCreateOpen(false);
            resetForm();
            fetchClients();
            refreshAgency?.();
        } catch (error: any) {
            toast.error(error?.message || error?.detail || 'Failed to create client');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || !form.name.trim()) {
            toast.error('Client name is required');
            return;
        }
        setSubmitting(true);
        try {
            await apiClient.patch(`/clients/${selectedClient.id}`, {
                name: form.name.trim(),
                industry: form.industry.trim() || undefined,
                website: form.website.trim() || undefined,
                is_active: form.is_active,
                account_mode: form.account_mode,
            });
            toast.success('Client updated');
            setEditOpen(false);
            resetForm();
            fetchClients();
            refreshAgency?.();
        } catch (error: any) {
            toast.error(error?.message || error?.detail || 'Failed to update client');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedClient) return;
        setSubmitting(true);
        try {
            await apiClient.delete(`/clients/${selectedClient.id}`);
            toast.success('Client removed');
            setDeleteOpen(false);
            setSelectedClient(null);
            fetchClients();
            refreshAgency?.();
        } catch (error: any) {
            toast.error(error?.message || error?.detail || 'Failed to delete client');
        } finally {
            setSubmitting(false);
        }
    };

    const openEdit = (client: Client) => {
        setSelectedClient(client);
        setForm({
            name: client.name,
            industry: client.industry || '',
            website: client.website || '',
            is_active: client.is_active,
            account_mode: client.account_mode || 'kaivo_managed',
        });
        setEditOpen(true);
    };

    const openDelete = (client: Client) => {
        setSelectedClient(client);
        setDeleteOpen(true);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Link
                            href="/agency/dashboard"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <h1 className="text-2xl font-bold text-foreground">Clients</h1>
                    </div>
                    <p className="text-foreground/80">
                        Manage clients (brands) under your agency
                    </p>
                </div>
                <RoleGuard allowedRoles={['agency_admin', 'agency_member']}>
                    <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add client
                    </Button>
                </RoleGuard>
            </div>

            {!agencyId ? (
                <Card className="bg-card/50 border-white/20">
                    <CardContent className="pt-6">
                        <p className="text-foreground/80">
                            No agency selected. Use the agency switcher or create an agency in settings.
                        </p>
                    </CardContent>
                </Card>
            ) : loading ? (
                <Card className="bg-card/50 border-white/20">
                    <CardContent className="pt-6">
                        <p className="text-foreground/80">Loading clients…</p>
                    </CardContent>
                </Card>
            ) : clients.length === 0 ? (
                <Card className="bg-card/50 border-white/20">
                    <CardContent className="pt-6">
                        <div className="text-center py-8">
                            <Users2 className="h-12 w-12 text-foreground/40 mx-auto mb-4" />
                            <p className="text-foreground/80 mb-4">No clients yet</p>
                            <RoleGuard allowedRoles={['agency_admin', 'agency_member']}>
                                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add your first client
                                </Button>
                            </RoleGuard>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {clients.map((client) => (
                        <Card key={client.id} className="bg-card/50 border-white/20">
                            <CardContent className="pt-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-foreground">{client.name}</h3>
                                            {!client.is_active && (
                                                <span className="text-xs text-amber-400 bg-amber-400/20 px-2 py-0.5 rounded">
                                                    Inactive
                                                </span>
                                            )}
                                            {(client.account_mode || 'kaivo_managed') === 'kaivo_managed' ? (
                                                <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                                                    <Monitor className="h-3 w-3" />
                                                    Kaivo-Managed
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                                                    <BarChart3 className="h-3 w-3" />
                                                    Reporting Only
                                                </span>
                                            )}
                                        </div>
                                        {(client.industry || client.website) && (
                                            <div className="flex flex-wrap gap-3 text-sm text-foreground/70 mt-2">
                                                {client.industry && (
                                                    <span className="flex items-center gap-1">
                                                        <Briefcase className="h-4 w-4" />
                                                        {client.industry}
                                                    </span>
                                                )}
                                                {client.website && (
                                                    <a
                                                        href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-primary hover:underline"
                                                    >
                                                        <Globe className="h-4 w-4" />
                                                        {client.website}
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <RoleGuard allowedRoles={['agency_admin', 'agency_member']}>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEdit(client)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <RoleGuard allowedRoles={['agency_admin']}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    onClick={() => openDelete(client)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </RoleGuard>
                                        </div>
                                    </RoleGuard>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="bg-card border-white/20">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Add client</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Name *</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Client or brand name"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Industry</label>
                            <Input
                                value={form.industry}
                                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                                placeholder="e.g. Retail, SaaS"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Website</label>
                            <Input
                                value={form.website}
                                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                                placeholder="https://..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-2">Billing Mode *</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, account_mode: 'kaivo_managed' }))}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        form.account_mode === 'kaivo_managed'
                                            ? 'border-primary bg-primary/10'
                                            : 'border-white/20 hover:border-white/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Monitor className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-semibold text-foreground">Kaivo-Managed</span>
                                    </div>
                                    <p className="text-xs text-gray-400">Run ads via Kaivo. Requires ad credits.</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, account_mode: 'reporting_only' }))}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        form.account_mode === 'reporting_only'
                                            ? 'border-purple-500 bg-purple-500/10'
                                            : 'border-white/20 hover:border-white/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <BarChart3 className="h-4 w-4 text-purple-400" />
                                        <span className="text-sm font-semibold text-foreground">Reporting Only</span>
                                    </div>
                                    <p className="text-xs text-gray-400">Own accounts. Platform fee only.</p>
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="create-active"
                                checked={form.is_active}
                                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                className="rounded border-white/30"
                            />
                            <label htmlFor="create-active" className="text-sm text-foreground/90">Active</label>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting || !form.name.trim()}>
                                {submitting ? 'Creating…' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={(open) => { if (!open) resetForm(); setEditOpen(open); }}>
                <DialogContent className="bg-card border-white/20">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Edit client</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Name *</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Client or brand name"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Industry</label>
                            <Input
                                value={form.industry}
                                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                                placeholder="e.g. Retail, SaaS"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-1">Website</label>
                            <Input
                                value={form.website}
                                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                                placeholder="https://..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground/90 mb-2">Billing Mode *</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, account_mode: 'kaivo_managed' }))}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        form.account_mode === 'kaivo_managed'
                                            ? 'border-primary bg-primary/10'
                                            : 'border-white/20 hover:border-white/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Monitor className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-semibold text-foreground">Kaivo-Managed</span>
                                    </div>
                                    <p className="text-xs text-gray-400">Run ads via Kaivo. Requires ad credits.</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, account_mode: 'reporting_only' }))}
                                    className={`p-3 rounded-lg border text-left transition-all ${
                                        form.account_mode === 'reporting_only'
                                            ? 'border-purple-500 bg-purple-500/10'
                                            : 'border-white/20 hover:border-white/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <BarChart3 className="h-4 w-4 text-purple-400" />
                                        <span className="text-sm font-semibold text-foreground">Reporting Only</span>
                                    </div>
                                    <p className="text-xs text-gray-400">Own accounts. Platform fee only.</p>
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="edit-active"
                                checked={form.is_active}
                                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                className="rounded border-white/30"
                            />
                            <label htmlFor="edit-active" className="text-sm text-foreground/90">Active</label>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting || !form.name.trim()}>
                                {submitting ? 'Saving…' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="bg-card border-white/20">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Remove client</DialogTitle>
                    </DialogHeader>
                    <p className="text-foreground/80">
                        Remove <strong className="text-foreground">{selectedClient?.name}</strong>? Campaigns and data linked to this client may be affected.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={submitting}
                        >
                            {submitting ? 'Removing…' : 'Remove'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
