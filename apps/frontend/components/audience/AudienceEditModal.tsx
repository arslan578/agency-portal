"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Loader2 } from 'lucide-react';
import { Audience } from '@/types/campaign';

interface AudienceEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    audience: Audience | null;
    onSave: (audienceId: number, updates: { name?: string; description?: string; definition?: any }) => Promise<void>;
}

export function AudienceEditModal({ open, onOpenChange, audience, onSave }: AudienceEditModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [geo, setGeo] = useState('');
    const [languages, setLanguages] = useState('');
    const [interests, setInterests] = useState('');
    const [keywords, setKeywords] = useState('');
    const [exclusions, setExclusions] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (audience && open) {
            setName(audience.name || '');
            setDescription(audience.description || '');
            const def = audience.definition || {};
            setGeo(Array.isArray(def.geo) ? def.geo.join(', ') : '');
            setLanguages(Array.isArray(def.languages) ? def.languages.join(', ') : '');
            setInterests(Array.isArray(def.interests) ? def.interests.join(', ') : '');
            setKeywords(Array.isArray(def.keywords) ? def.keywords.join(', ') : '');
            setExclusions(Array.isArray(def.exclusions) ? def.exclusions.join(', ') : '');
            setError(null);
        }
    }, [audience, open]);

    const handleSave = async () => {
        if (!audience) return;
        
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const definition: any = {};
            
            if (geo.trim()) {
                definition.geo = geo.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            if (languages.trim()) {
                definition.languages = languages.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            if (interests.trim()) {
                definition.interests = interests.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            if (keywords.trim()) {
                definition.keywords = keywords.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            if (exclusions.trim()) {
                definition.exclusions = exclusions.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }

            const updates: any = {
                name: name.trim(),
            };

            if (description.trim()) {
                updates.description = description.trim();
            }

            if (Object.keys(definition).length > 0) {
                updates.definition = definition;
            }

            await onSave(audience.id, updates);
        } catch (err: any) {
            setError(err.message || 'Failed to save audience');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        onOpenChange(false);
        setError(null);
    };

    if (!audience) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Audience</DialogTitle>
                    <DialogDescription>
                        Update audience details and targeting parameters.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter audience name"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter audience description"
                            rows={3}
                        />
                    </div>

                    <div className="space-y-4 pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-300">Targeting Definition</h3>
                        
                        <div className="space-y-2">
                            <Label htmlFor="geo">Geographic Locations</Label>
                            <Input
                                id="geo"
                                value={geo}
                                onChange={(e) => setGeo(e.target.value)}
                                placeholder="e.g., United States, Canada, United Kingdom (comma-separated)"
                            />
                            <p className="text-xs text-gray-500">Enter countries or regions, separated by commas</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="languages">Languages</Label>
                            <Input
                                id="languages"
                                value={languages}
                                onChange={(e) => setLanguages(e.target.value)}
                                placeholder="e.g., English, Spanish, French (comma-separated)"
                            />
                            <p className="text-xs text-gray-500">Enter languages, separated by commas</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="interests">Interests</Label>
                            <Input
                                id="interests"
                                value={interests}
                                onChange={(e) => setInterests(e.target.value)}
                                placeholder="e.g., Technology, Sports, Music (comma-separated)"
                            />
                            <p className="text-xs text-gray-500">Enter interests, separated by commas</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="keywords">Keywords (Optional)</Label>
                            <Input
                                id="keywords"
                                value={keywords}
                                onChange={(e) => setKeywords(e.target.value)}
                                placeholder="e.g., startup, entrepreneur, business (comma-separated)"
                            />
                            <p className="text-xs text-gray-500">Enter keywords, separated by commas</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exclusions">Exclusions (Optional)</Label>
                            <Input
                                id="exclusions"
                                value={exclusions}
                                onChange={(e) => setExclusions(e.target.value)}
                                placeholder="e.g., competitor, competitor brand (comma-separated)"
                            />
                            <p className="text-xs text-gray-500">Enter exclusion terms, separated by commas</p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                        className="bg-primary hover:bg-kaivo-teal-glow text-black"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
