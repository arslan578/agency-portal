'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Loader2 } from 'lucide-react';

interface CreateAudienceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientId: number | null;
    clientName?: string | null;
    onCreate: (payload: { client_id: number; name: string; description?: string; definition?: Record<string, unknown> }) => Promise<void>;
}

export function CreateAudienceModal({
    open,
    onOpenChange,
    clientId,
    clientName,
    onCreate,
}: CreateAudienceModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Audience name is required');
            return;
        }
        if (!clientId) {
            setError('Please select a client first (use the client selector in the header).');
            return;
        }
        setCreating(true);
        setError(null);
        try {
            await onCreate({
                client_id: clientId,
                name: trimmedName,
                description: description.trim() || undefined,
                definition: {},
            });
            setName('');
            setDescription('');
            onOpenChange(false);
        } catch (err: unknown) {
            let msg = 'Failed to create audience';
            if (err && typeof err === 'object') {
                const e = err as { detail?: string | { msg?: string }[]; message?: string };
                if (typeof e.detail === 'string') {
                    msg = e.detail;
                } else if (Array.isArray(e.detail) && e.detail[0]?.msg) {
                    msg = e.detail[0].msg;
                } else if (e.message) {
                    msg = String(e.message);
                }
            }
            setError(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setError(null);
            setName('');
            setDescription('');
        }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Create Audience</DialogTitle>
                    <DialogDescription>
                        Add a new audience for {clientName ? `"${clientName}"` : 'your selected client'}. You can add targeting details later from the list.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {!clientId && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
                            Select a client from the header dropdown before creating an audience.
                        </div>
                    )}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="create-audience-name">Name *</Label>
                        <Input
                            id="create-audience-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Summer Campaign Audience"
                            disabled={!clientId}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="create-audience-desc">Description (optional)</Label>
                        <Input
                            id="create-audience-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description"
                            disabled={!clientId}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={creating}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={creating || !name.trim() || !clientId}
                        className="bg-primary hover:bg-kaivo-teal-glow text-black"
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Audience'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
