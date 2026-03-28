"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Loader2, Info, Sparkles, Globe, Zap, AlertCircle, Save, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient as api } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { toast } from 'sonner';
import { getDemoCreativeVariants, isDemoMode } from '@/lib/demoData';

interface CreativeVariant {
    text: string;
    tone: string;
    rationale: string;
    score: number;
}

interface VariantGroup {
    type: string;
    label: string;
    variants: CreativeVariant[];
}

// Skeleton loader component
function VariantSkeleton() {
    return (
        <Card className="animate-pulse">
            <CardContent className="p-4">
                <div className="flex justify-between items-start gap-4 mb-2">
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                        <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                    <div className="h-8 w-12 bg-muted rounded"></div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed">
                    <div className="h-3 w-24 bg-muted rounded"></div>
                    <div className="flex gap-2">
                        <div className="h-8 w-8 bg-muted rounded"></div>
                        <div className="h-8 w-8 bg-muted rounded"></div>
                        <div className="h-8 w-8 bg-muted rounded"></div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function VariantGenerator() {
    const { t, availableLanguages: languages } = useTranslation();
    const router = useRouter();
    const [baseText, setBaseText] = useState('');
    const [targetLang, setTargetLang] = useState('en');
    const [generating, setGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<string>('');
    const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
    const [progressPercent, setProgressPercent] = useState(0);
    const startTimeRef = useRef<number | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [variantData, setVariantData] = useState<Record<string, CreativeVariant[]>>({});
    const [selectedType, setSelectedType] = useState<string>('all');
    const [savedVariantsId, setSavedVariantsId] = useState<string | null>(null);

    // Group variants by type for display
    const variantGroups = useMemo<VariantGroup[]>(() => {
        const groups: VariantGroup[] = [];
        const typeLabels: Record<string, string> = {
            headline_short: 'Short Headlines',
            headline_long: 'Long Headlines',
            body: 'Body Copy',
            cta: 'Call-to-Actions',
            keywords: 'Keywords'
        };

        Object.entries(variantData).forEach(([type, variants]) => {
            if (variants && variants.length > 0) {
                groups.push({
                    type,
                    label: typeLabels[type] || type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    variants
                });
            }
        });

        return groups;
    }, [variantData]);

    const allVariants = useMemo(() => {
        return Object.values(variantData).flat();
    }, [variantData]);

    const displayVariants = useMemo(() => {
        if (selectedType === 'all') {
            return allVariants;
        }
        return variantData[selectedType] || [];
    }, [selectedType, variantData, allVariants]);

    const handleGenerate = async () => {
        if (!baseText.trim()) {
            toast.error('Please enter base text to generate variants');
            return;
        }

        // Clear any existing interval
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
        }

        setGenerating(true);
        setVariantData({});
        setGenerationProgress('Initializing AI generation...');
        setEstimatedTime(30); // Estimated 30 seconds
        setProgressPercent(0);
        startTimeRef.current = Date.now();
        
        // Simulate progress updates using ref to avoid closure issues
        progressIntervalRef.current = setInterval(() => {
            if (startTimeRef.current) {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                const initialEstimate = 30;
                const remaining = Math.max(0, initialEstimate - elapsed);
                
                // Update progress percentage
                const total = initialEstimate;
                const percent = Math.min(100, (elapsed / total) * 100);
                setProgressPercent(percent);
                
                // Update progress messages
                if (elapsed < 5) {
                    setGenerationProgress('Analyzing your brief and context...');
                } else if (elapsed < 15) {
                    setGenerationProgress('Generating creative variants with AI...');
                } else if (elapsed < 25) {
                    setGenerationProgress('Optimizing variants for conversion...');
                } else {
                    setGenerationProgress('Finalizing and scoring variants...');
                }
                
                setEstimatedTime(remaining);
            }
        }, 1000);

        if (isDemoMode()) {
            // Use demo creative variants
            const demoVariants = getDemoCreativeVariants();
            
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            
            setGenerationProgress('Complete!');
            setProgressPercent(100);
            setVariantData({
                headline_short: demoVariants?.headline_short || [],
                headline_long: demoVariants?.headline_long || [],
                body: demoVariants?.body || [],
                cta: demoVariants?.cta || [],
                keywords: demoVariants?.keywords || []
            });
            
            const totalCount = Object.values(demoVariants).reduce((sum, variants) => sum + variants.length, 0);
            const elapsed = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
            toast.success(`Successfully loaded ${totalCount} demo creative variants in ${elapsed}s!`);
        } else {
            try {
                const response = await api.post<{ variants: Record<string, CreativeVariant[]> }>(
                    API_ENDPOINTS.CREATIVE.GENERATE, 
                    {
                        brand_id: 1,
                        brief: baseText.trim(),
                        objective: "conversion",
                        variant_types: ["headline_short", "headline_long", "body", "cta"],
                        audience: { language: targetLang },
                        cache_ttl_minutes: 30
                    },
                    { timeout: 1200000 }
                );

                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                }
                
                setGenerationProgress('Complete!');
                setProgressPercent(100);
                setVariantData(response.variants);
                
                const totalCount = Object.values(response.variants).reduce((sum, variants) => sum + variants.length, 0);
                const elapsed = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
                toast.success(`Successfully generated ${totalCount} creative variants in ${elapsed}s!`);
            } catch (error: any) {
                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                }
                console.error("Generation failed", error);
                const errorMessage = error?.message || 'Failed to generate variants. Please try again.';
                toast.error(errorMessage);
                setGenerationProgress('');
                setProgressPercent(0);
            } finally {
                setGenerating(false);
                setEstimatedTime(null);
                startTimeRef.current = null;
                setTimeout(() => {
                    setGenerationProgress('');
                    setProgressPercent(0);
                }, 2000);
            }
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const handleSaveVariants = () => {
        if (Object.keys(variantData).length === 0) {
            toast.error('No variants to save');
            return;
        }

        try {
            const variantsId = `variants_${Date.now()}`;
            const savedData = {
                id: variantsId,
                baseText,
                targetLang,
                variants: variantData,
                createdAt: new Date().toISOString(),
            };
            
            // Save to localStorage
            const savedVariants = JSON.parse(localStorage.getItem('kaivo_saved_variants') || '[]');
            savedVariants.push(savedData);
            localStorage.setItem('kaivo_saved_variants', JSON.stringify(savedVariants));
            
            setSavedVariantsId(variantsId);
            toast.success('Variants saved successfully! You can use them in campaign creation.');
        } catch (error) {
            console.error('Failed to save variants:', error);
            toast.error('Failed to save variants');
        }
    };

    const handleUseInCampaign = () => {
        if (Object.keys(variantData).length === 0) {
            toast.error('No variants to use');
            return;
        }

        try {
            let variantsId = savedVariantsId;
            
            // Save variants first if not already saved (synchronously)
            if (!variantsId) {
                variantsId = `variants_${Date.now()}`;
                const savedData = {
                    id: variantsId,
                    baseText,
                    targetLang,
                    variants: variantData,
                    createdAt: new Date().toISOString(),
                };
                
                // Save to localStorage
                const savedVariants = JSON.parse(localStorage.getItem('kaivo_saved_variants') || '[]');
                savedVariants.push(savedData);
                localStorage.setItem('kaivo_saved_variants', JSON.stringify(savedVariants));
                
                setSavedVariantsId(variantsId);
            }

            // Navigate to campaign creation with variants
            router.push(`/plans/new?variants=${variantsId}`);
        } catch (error) {
            console.error('Failed to save variants:', error);
            toast.error('Failed to save variants. Please try again.');
        }
    };

    const getScoreVariant = (score: number): 'success' | 'warning' | 'neutral' | 'default' => {
        // Score is 0-1, convert to 0-100 for display
        const scorePercent = score * 100;
        if (scorePercent >= 90) return 'success';
        if (scorePercent >= 70) return 'warning';
        return 'neutral';
    };

    const getScoreLabel = (score: number) => {
        const scorePercent = score * 100;
        if (scorePercent >= 90) return 'Excellent';
        if (scorePercent >= 80) return 'Great';
        if (scorePercent >= 70) return 'Good';
        return 'Fair';
    };

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
        };
    }, []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Section */}
            <div className="space-y-6">
                <Card className="border-primary/20 shadow-lg shadow-primary/5 bg-gradient-to-br from-card to-card/95 overflow-visible">
                    <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent border-b border-primary/10 pb-4">
                        <CardTitle className="flex items-center gap-3 text-xl">
                            <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
                                <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            <span>{t('creative.generate_title')}</span>
                        </CardTitle>
                        <CardDescription className="text-muted-foreground mt-2">
                            {t('creative.generate_desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6 overflow-visible">
                        <div className="space-y-2">
                            <Label htmlFor="base-text" className="text-sm font-semibold">
                                {t('creative.base_text')}
                            </Label>
                            <Input
                                id="base-text"
                                placeholder="e.g., Summer Sale - 50% Off Everything!"
                                value={baseText}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseText(e.target.value)}
                                className="h-12 text-base border-primary/20 focus:border-primary focus:ring-primary/20"
                                disabled={generating}
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter the core message or theme for your ad creative
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                                {t('creative.target_language')}
                            </Label>
                            {generating ? (
                                <div className={cn(
                                    "h-12 border border-input bg-background rounded-md px-3 py-2 flex items-center gap-2 opacity-50 cursor-not-allowed"
                                )}>
                                    <Globe className="h-4 w-4 opacity-60" />
                                    <span className="text-sm">
                                        {languages.find((l: { code: string; name: string }) => l.code === targetLang)?.name || 'Select Language'}
                                    </span>
                                </div>
                            ) : (
                                <Select value={targetLang} onValueChange={setTargetLang}>
                                    <SelectTrigger className="h-12 border-primary/20 focus:border-primary bg-background">
                                        <div className="flex items-center gap-2">
                                            <Globe className="h-4 w-4 opacity-60" />
                                            <span>
                                                {languages.find((l: { code: string; name: string }) => l.code === targetLang)?.name || 'Select Language'}
                                            </span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-primary/30">
                                        {languages.map((lang: { code: string; name: string }) => (
                                            <SelectItem key={lang.code} value={lang.code}>
                                                <div className="flex items-center gap-2">
                                                    <Globe className="h-4 w-4" />
                                                    {lang.name}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Select the target language for generated variants
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 pt-6 border-t border-border space-y-4">
                        {generating && (
                            <div className="w-full space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{generationProgress || 'Generating...'}</span>
                                    {estimatedTime !== null && (
                                        <span className="text-primary font-medium">
                                            ~{estimatedTime}s remaining
                                        </span>
                                    )}
                                </div>
                                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="h-full bg-primary transition-all duration-500 ease-out"
                                        style={{
                                            width: `${progressPercent}%`
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                        <Button
                            onClick={handleGenerate}
                            disabled={!baseText.trim() || generating}
                            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                    {generationProgress || 'Generating Variants...'}
                                </>
                            ) : (
                                <>
                                    <Zap className="h-5 w-5 mr-2" />
                                    Generate Variants
                                </>
                            )}
                        </Button>
                        {generating && (
                            <p className="text-xs text-center text-muted-foreground">
                                This may take 20-40 seconds. Variants are being optimized for your target audience.
                            </p>
                        )}
                    </CardFooter>
                </Card>

                
            </div>

            {/* Variants Display Section */}
            <div className="space-y-4">
                {variantGroups.length > 0 && (
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-foreground mb-1">
                                {t('creative.generated_variants')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {allVariants.length} variants across {variantGroups.length} types
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSaveVariants}
                                variant="outline"
                                size="sm"
                                className="gap-2"
                            >
                                <Save className="h-4 w-4" />
                                Save Variants
                            </Button>
                            <Button
                                onClick={handleUseInCampaign}
                                size="sm"
                                className="gap-2 bg-primary hover:bg-primary/90"
                            >
                                Use in Campaign
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {variantGroups.length > 1 && (
                    <div className="flex flex-wrap gap-2 p-1 bg-muted/50 rounded-lg border border-border">
                        <Button
                            variant={selectedType === 'all' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setSelectedType('all')}
                            className={cn(
                                "text-xs h-8",
                                selectedType === 'all' && "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            All ({allVariants.length})
                        </Button>
                        {variantGroups.map((group) => (
                            <Button
                                key={group.type}
                                variant={selectedType === group.type ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setSelectedType(group.type)}
                                className={cn(
                                    "text-xs h-8",
                                    selectedType === group.type && "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                            >
                                {group.label.split(' ')[0]} ({group.variants.length})
                            </Button>
                        ))}
                    </div>
                )}

                <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                    {generating && displayVariants.length === 0 && (
                        <div className="space-y-2.5">
                            {[...Array(3)].map((_, i) => (
                                <VariantSkeleton key={i} />
                            ))}
                        </div>
                    )}

                    {!generating && displayVariants.length > 0 && displayVariants.map((variant: CreativeVariant, index: number) => (
                        <Card
                            key={index}
                            className="group hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 bg-gradient-to-br from-card to-card/50 cursor-pointer"
                            onClick={() => handleCopy(variant.text)}
                            title="Click to copy variant text"
                        >
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4 mb-2.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base leading-relaxed font-medium text-foreground mb-1.5 group-hover:text-primary transition-colors">
                                            {variant.text}
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                            {variant.tone}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <Badge
                                            variant={getScoreVariant(variant.score)}
                                            className="px-2.5 py-1 text-sm font-bold"
                                        >
                                            {(variant.score * 100).toFixed(0)}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                            {getScoreLabel(variant.score)}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Rationale - Visible Text */}
                                <div className="pt-2.5 mt-2.5 border-t border-border/50">
                                    <div className="flex items-start gap-2">
                                        <Info className="h-3.5 w-3.5 text-primary/70 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                                Rationale
                                            </p>
                                            <p className="text-sm text-foreground/80 leading-relaxed">
                                                {variant.rationale}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {!generating && displayVariants.length === 0 && allVariants.length === 0 && (
                        <Card className="border-2 border-dashed border-border/50 bg-muted/20">
                            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                                <div className="p-4 rounded-full bg-primary/10 border border-primary/20 mb-4">
                                    <Sparkles className="h-8 w-8 text-primary opacity-60" />
                                </div>
                                <h4 className="text-lg font-semibold text-foreground mb-2">No Variants Generated Yet</h4>
                                <p className="text-sm text-muted-foreground max-w-sm mb-1">
                                    Enter your base text above and click "Generate Variants" to create AI-powered creative variations.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    You'll get multiple variants optimized for conversion across different formats.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {!generating && displayVariants.length === 0 && allVariants.length > 0 && (
                        <Card className="border-2 border-dashed border-border/50 bg-muted/20">
                            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                                <AlertCircle className="h-6 w-6 text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    No variants found for this type. Select "All" to see all generated variants.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}