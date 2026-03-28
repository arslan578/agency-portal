"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Plus, X, Save, XCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PlatformAllocationsEditorProps {
    currentAllocations: Record<string, number>;
    totalBudgetCents: number;
    onSave: (allocations: Record<string, number>) => Promise<void>;
    onCancel: () => void;
}

const AVAILABLE_PLATFORMS = [
    { id: 'meta', name: 'Meta (Facebook + Instagram)', color: 'bg-blue-500' },
    { id: 'google', name: 'Google Ads', color: 'bg-green-500' },
    { id: 'tiktok', name: 'TikTok', color: 'bg-purple-500' },
    { id: 'youtube', name: 'YouTube Ads', color: 'bg-red-500' },
    { id: 'snapchat', name: 'Snapchat', color: 'bg-yellow-500' },
    { id: 'linkedin', name: 'LinkedIn Ads', color: 'bg-cyan-500' },
    { id: 'twitter', name: 'Twitter/X Ads', color: 'bg-gray-500' },
];

export function PlatformAllocationsEditor({
    currentAllocations,
    totalBudgetCents,
    onSave,
    onCancel
}: PlatformAllocationsEditorProps) {
    const [allocations, setAllocations] = useState<Record<string, number>>(currentAllocations);
    const [saving, setSaving] = useState(false);

    const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
    const totalBudgetDollars = totalBudgetCents / 100;
    const totalAllocatedDollars = totalAllocated / 100;
    const isValid = totalAllocated === totalBudgetCents;

    const handleAmountChange = (platform: string, valueDollars: string) => {
        const cents = Math.round(parseFloat(valueDollars || '0') * 100);
        setAllocations(prev => ({
            ...prev,
            [platform]: cents
        }));
    };

    const handleRemovePlatform = (platform: string) => {
        const newAllocations = { ...allocations };
        delete newAllocations[platform];
        setAllocations(newAllocations);
    };

    const handleAddPlatform = (platformId: string) => {
        if (allocations[platformId]) {
            toast.error('Platform already added');
            return;
        }
        
        // Calculate remaining budget
        const remaining = totalBudgetCents - totalAllocated;
        setAllocations(prev => ({
            ...prev,
            [platformId]: remaining > 0 ? remaining : 0
        }));
    };

    const handleSave = async () => {
        if (!isValid) {
            toast.error('Total allocations must equal the campaign budget');
            return;
        }

        setSaving(true);
        try {
            await onSave(allocations);
            toast.success('Platform allocations updated successfully');
        } catch (error: any) {
            toast.error(`Failed to save: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const availablePlatformsToAdd = AVAILABLE_PLATFORMS.filter(
        p => !allocations[p.id]
    );

    return (
        <Card className="border-primary/20">
            <CardHeader>
                <CardTitle>Platform Budget Allocation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Budget Summary */}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                    <div>
                        <div className="text-sm text-gray-400">Total Budget</div>
                        <div className="text-2xl font-bold text-foreground">
                            ${totalBudgetDollars.toFixed(2)}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-400">Allocated</div>
                        <div className="text-2xl font-bold flex items-center gap-2">
                            <span className={isValid ? 'text-green-400' : 'text-red-400'}>
                                ${totalAllocatedDollars.toFixed(2)}
                            </span>
                            {isValid ? (
                                <CheckCircle className="h-5 w-5 text-green-400" />
                            ) : (
                                <XCircle className="h-5 w-5 text-red-400" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Platform List */}
                <div className="space-y-3">
                    {Object.entries(allocations).map(([platformId, amountCents]) => {
                        const platform = AVAILABLE_PLATFORMS.find(p => p.id === platformId);
                        const platformName = platform?.name || platformId;
                        const amountDollars = amountCents / 100;
                        const percentage = totalBudgetCents > 0 ? (amountCents / totalBudgetCents) * 100 : 0;

                        return (
                            <div
                                key={platformId}
                                className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="font-semibold text-foreground capitalize">
                                        {platformName}
                                    </div>
                                    <button
                                        onClick={() => handleRemovePlatform(platformId)}
                                        className="text-red-400 hover:text-red-300 transition-colors"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-400">$</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={amountDollars.toFixed(2)}
                                                onChange={(e) => handleAmountChange(platformId, e.target.value)}
                                                className="flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-32">
                                        <Badge variant="secondary" className="text-sm">
                                            {percentage.toFixed(1)}%
                                        </Badge>
                                    </div>
                                </div>

                                {/* Visual Budget Bar */}
                                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${platform?.color || 'bg-gray-500'} transition-all duration-300`}
                                        style={{ width: `${Math.min(percentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add Platform Dropdown */}
                {availablePlatformsToAdd.length > 0 && (
                    <div className="pt-4 border-t border-white/10">
                        <div className="text-sm text-gray-400 mb-2">Add Platform</div>
                        <div className="flex flex-wrap gap-2">
                            {availablePlatformsToAdd.map(platform => (
                                <button
                                    key={platform.id}
                                    onClick={() => handleAddPlatform(platform.id)}
                                    className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    {platform.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Validation Message */}
                {!isValid && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-400">
                            {totalAllocated > totalBudgetCents
                                ? `Over-allocated by $${((totalAllocated - totalBudgetCents) / 100).toFixed(2)}`
                                : `Under-allocated by $${((totalBudgetCents - totalAllocated) / 100).toFixed(2)}`
                            }
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={!isValid || saving}
                        className="flex-1 gap-2"
                    >
                        {saving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                Save Changes
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={onCancel}
                        variant="outline"
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

