"use client";

import { useState, KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Globe, Languages as LanguagesIcon, Target, X, Save, Loader2, type LucideIcon } from 'lucide-react';
import { Audience } from '@/types/campaign';
import { toast } from 'sonner';

interface AudienceEditorProps {
    audience: Audience;
    onSave: (definition: Audience['definition']) => Promise<void>;
    onCancel: () => void;
}

function TagInput({
    label,
    icon: Icon,
    tags,
    onAdd,
    onRemove,
    placeholder,
    colorClass,
}: {
    label: string;
    icon: LucideIcon;
    tags: string[];
    onAdd: (tag: string) => void;
    onRemove: (tag: string) => void;
    placeholder: string;
    colorClass: string;
}) {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
            e.preventDefault();
            const value = inputValue.trim().replace(/,$/, '');
            if (value && !tags.includes(value)) {
                onAdd(value);
            }
            setInputValue('');
        }
        if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            onRemove(tags[tags.length - 1]);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">{label}</span>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-lg border border-border bg-muted/30 focus-within:border-primary/50 transition-colors">
                {tags.map((tag) => (
                    <Badge
                        key={tag}
                        className={`${colorClass} flex items-center gap-1 pr-1`}
                    >
                        {tag}
                        <button
                            type="button"
                            onClick={() => onRemove(tag)}
                            className="ml-1 rounded-full p-0.5 hover:bg-white/20 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={tags.length === 0 ? placeholder : 'Add more...'}
                    className="flex-1 min-w-[120px] bg-transparent text-white text-sm outline-none placeholder:text-gray-500"
                />
            </div>
            <p className="text-xs text-gray-500">Press Enter or comma to add</p>
        </div>
    );
}

export function AudienceEditor({ audience, onSave, onCancel }: AudienceEditorProps) {
    const [geo, setGeo] = useState<string[]>(audience.definition?.geo || []);
    const [languages, setLanguages] = useState<string[]>(audience.definition?.languages || []);
    const [interests, setInterests] = useState<string[]>(audience.definition?.interests || []);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({
                geo,
                languages,
                interests,
                keywords: audience.definition?.keywords || [],
                exclusions: audience.definition?.exclusions || [],
            });
            toast.success('Targeting updated successfully');
        } catch (error: any) {
            toast.error(`Failed to update targeting: ${error.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border-primary/30">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Edit Targeting
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <TagInput
                    label="Geographic Targeting"
                    icon={Globe}
                    tags={geo}
                    onAdd={(tag) => setGeo([...geo, tag.toUpperCase()])}
                    onRemove={(tag) => setGeo(geo.filter((t) => t !== tag))}
                    placeholder="Type country code (e.g. US, UK, TH) and press Enter"
                    colorClass="bg-blue-500/20 text-blue-400 border-blue-500/30"
                />

                <TagInput
                    label="Target Languages"
                    icon={LanguagesIcon}
                    tags={languages}
                    onAdd={(tag) => setLanguages([...languages, tag.toLowerCase()])}
                    onRemove={(tag) => setLanguages(languages.filter((t) => t !== tag))}
                    placeholder="Type language code (e.g. en, th, es) and press Enter"
                    colorClass="bg-purple-500/20 text-purple-400 border-purple-500/30"
                />

                <TagInput
                    label="Interests & Topics"
                    icon={Target}
                    tags={interests}
                    onAdd={(tag) => setInterests([...interests, tag])}
                    onRemove={(tag) => setInterests(interests.filter((t) => t !== tag))}
                    placeholder="Type interest (e.g. fashion, travel, coffee) and press Enter"
                    colorClass="bg-green-500/20 text-green-400 border-green-500/30"
                />
            </CardContent>
        </Card>
    );
}
