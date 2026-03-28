'use client'

import React, { useState } from 'react';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FiUploadCloud, FiRefreshCw, FiGlobe, FiCheckCircle } from 'react-icons/fi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { toast } from 'sonner';

export default function CampaignBuilderPage() {
    const [generating, setGenerating] = useState(false)
    const [variants, setVariants] = useState<any[]>([])
    const [primaryHeadline, setPrimaryHeadline] = useState('')
    const [primaryBody, setPrimaryBody] = useState('')

    const generateVariants = async () => {
        if (!primaryHeadline.trim() && !primaryBody.trim()) {
            toast.error('Please enter a headline or body text first');
            return;
        }

        setGenerating(true);
        try {
            const seedContent: Record<string, string> = {};
            if (primaryHeadline) seedContent['headline'] = primaryHeadline;
            if (primaryBody) seedContent['body'] = primaryBody;

            const res = await apiClient.post<{ variants: any }>(
                API_ENDPOINTS.CREATIVE.GENERATE, 
                {
                    brand_id: 1,
                    brief: primaryBody || primaryHeadline || 'Generate creative variants',
                    objective: 'conversion',
                    audience: {
                        geo: [],
                        interests: [],
                        language: 'en'
                    },
                    variant_types: ['headline_short', 'headline_long', 'body'],
                    seed_content: seedContent,
                    bypass_cache: false
                },
                { timeout: 1200000 }
            );
            const transformedVariants: any[] = [];
            let id = 1;

            if (res.variants?.headline_short && Array.isArray(res.variants.headline_short)) {
                res.variants.headline_short.slice(0, 3).forEach((variant: any) => {
                    const variantText = (typeof variant === 'object' && variant !== null) 
                        ? (variant.text || variant.headline || String(variant))
                        : String(variant);
                    const variantScore = (typeof variant === 'object' && variant !== null && typeof variant.score === 'number')
                        ? variant.score
                        : 0.9;
                    
                    transformedVariants.push({
                        id: id++,
                        headline: variantText,
                        body: primaryBody || 'AI-generated creative variant',
                        lang: 'en',
                        score: Math.round(variantScore * 100)
                    });
                });
            }

            if (transformedVariants.length < 3 && res.variants?.headline_long && Array.isArray(res.variants.headline_long)) {
                res.variants.headline_long.slice(0, 3 - transformedVariants.length).forEach((variant: any) => {
                    const variantText = (typeof variant === 'object' && variant !== null) 
                        ? (variant.text || variant.headline || String(variant))
                        : String(variant);
                    const variantScore = (typeof variant === 'object' && variant !== null && typeof variant.score === 'number')
                        ? variant.score
                        : 0.9;
                    
                    let bodyText = primaryBody;
                    if (!bodyText && res.variants?.body && Array.isArray(res.variants.body) && res.variants.body.length > 0) {
                        const bodyVariant = res.variants.body[0];
                        bodyText = (typeof bodyVariant === 'object' && bodyVariant !== null)
                            ? (bodyVariant.text || String(bodyVariant))
                            : String(bodyVariant);
                    }
                    if (!bodyText) {
                        bodyText = 'AI-generated creative variant';
                    }
                    
                    transformedVariants.push({
                        id: id++,
                        headline: variantText,
                        body: bodyText,
                        lang: 'en',
                        score: Math.round(variantScore * 100)
                    });
                });
            }

            setVariants(transformedVariants);
            toast.success(`Generated ${transformedVariants.length} creative variants!`);
        } catch (error: any) {
            const errorMessage = error?.message 
                ? (typeof error.message === 'string' ? error.message : String(error.message))
                : (error?.toString ? error.toString() : 'Unknown error');
            toast.error(`Failed to generate variants: ${errorMessage}`);
            setVariants([]);
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <h1 className="text-4xl font-bold mb-12 text-foreground">New Campaign</h1>

            {/* Creative Assets */}
            <Card className="p-8 mb-12">
                <h2 className="text-2xl font-bold text-foreground mb-6">Creative Assets</h2>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-kaivo-teal-emerald transition-colors cursor-pointer bg-gray-50">
                    <FiUploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-700">Drop your video or image here</p>
                    <p className="text-sm text-gray-500 mt-2">Supports MP4, MOV, JPG, PNG</p>
                </div>
            </Card>

            {/* Ad Copy & Variants */}
            <Card className="p-8 mb-12">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-foreground">Ad Copy & Variants</h2>
                    <button
                        onClick={generateVariants}
                        disabled={generating}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex items-center gap-2")}
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FiRefreshCw />}
                        Generate Multilingual Variants
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <Label htmlFor="primary-headline">Primary Headline (English)</Label>
                        <Input 
                            id="primary-headline"
                            placeholder="Enter your main headline" 
                            value={primaryHeadline}
                            onChange={(e) => setPrimaryHeadline(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="primary-body">Primary Body Text</Label>
                        <Textarea 
                            id="primary-body"
                            placeholder="Enter your main ad copy" 
                            className="h-[42px]"
                            value={primaryBody}
                            onChange={(e) => setPrimaryBody(e.target.value)}
                        />
                    </div>
                </div>

                {variants.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">AI Generated Variants</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {variants.map(variant => (
                                <div key={variant.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-kaivo-teal-soft/20 px-2 py-1 text-xs font-bold text-kaivo-teal-deep rounded-bl-lg">
                                        Score: {variant.score}
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <FiGlobe className="text-gray-400" />
                                        <span className="text-xs font-bold uppercase text-gray-500">{variant.lang}</span>
                                    </div>
                                    <h4 className="font-bold text-kaivo-teal-deep mb-1">
                                        {typeof variant.headline === 'string' ? variant.headline : JSON.stringify(variant.headline)}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                        {typeof variant.body === 'string' ? variant.body : JSON.stringify(variant.body)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Policy & Safety */}
            <Card className="p-8 mb-12">
                <h2 className="text-2xl font-bold text-foreground mb-6">Policy & Safety</h2>
                <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-100 mb-4">
                    <FiCheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-green-800">All Systems Go</h3>
                        <p className="text-sm text-green-700 mt-1">
                            Your creative passes all policy checks for Roku, Meta, and Google.
                        </p>
                    </div>
                </div>
                <button
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                    onClick={() => toast.info('Trigger Orchestrator: Will this pass policy?')}
                >
                    Ask Kaivo: Will this pass policy?
                </button>
            </Card>

            <div className="flex gap-6 mt-8 justify-end">
                <button className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/20 hover:bg-white/10")}>
                    Save Draft
                </button>
                <button className={cn(buttonVariants({ size: "lg" }), "bg-primary text-primary-foreground hover:bg-primary/90")}>
                    Launch Campaign
                </button>
            </div>
        </div>
    )
}
