"use client";

import React, { useState } from 'react';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Progress } from '@/components/ui/Progress';
import { CheckCircle, ArrowRight, Upload, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { toast } from 'sonner';

import { apiClient as api } from '@/lib/api/client';

interface AnalysisResult {
    readiness_scores: {
        creative: number;
        audience: number;
        language: number;
    };
    recommended_goal: string;
    recommended_platforms: string[];
    summary: string;
}

// API call
const analyzeBrand = async (data: { brand_docs: string }) => {
    const response = await api.post<AnalysisResult>('/onboarding/analyze', data);
    return response;
};

export function OnboardingWizard() {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [brandDocs, setBrandDocs] = useState('');
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

    const handleAnalyze = async () => {
        setLoading(true);
        try {
            const result = await analyzeBrand({ brand_docs: brandDocs });
            setAnalysisResult(result);
            setStep(2);
        } catch (error) {
            console.error("Analysis failed", error);
            toast.error("Failed to analyze brand. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto py-10 px-4">
            <div className="mb-8">
                <div className="flex justify-between text-sm font-medium mb-2 text-muted-foreground">
                    <span>Step {step} of 2</span>
                    <span>{step === 1 ? 'Analysis' : 'Strategy'}</span>
                </div>
                <Progress value={step === 1 ? 50 : 100} className="h-2" />
            </div>

            {step === 1 && (
                <Card className="border-primary/10 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl">{t('onboarding.title')}</CardTitle>
                        <CardDescription>{t('onboarding.description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="docs" className="text-base">{t('onboarding.brand_docs')}</Label>
                            <Textarea
                                id="docs"
                                placeholder="Paste your brand mission, target audience, or product details here..."
                                value={brandDocs}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBrandDocs(e.target.value)}
                                className="min-h-[200px] resize-none focus-visible:ring-primary"
                            />
                        </div>
                        <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-all group">
                            <div className="h-12 w-12 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
                                <Upload className="h-6 w-6 group-hover:text-primary transition-colors" />
                            </div>
                            <span className="text-sm font-medium">{t('onboarding.upload_assets')}</span>
                            <span className="text-xs text-muted-foreground mt-1">Supports PDF, DOCX, TXT</span>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <button onClick={handleAnalyze} disabled={!brandDocs || loading} className={cn(buttonVariants(), "w-full h-12 text-lg")}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                            {t('onboarding.analyze_cta')}
                        </button>
                    </CardFooter>
                </Card>
            )}

            {step === 2 && analysisResult && (
                <Card className="border-primary/10 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CardHeader>
                        <CardTitle className="text-2xl flex items-center gap-2">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            {t('onboarding.analysis_complete')}
                        </CardTitle>
                        <CardDescription>{t('onboarding.strategy_desc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {/* Scores */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: t('onboarding.creative_readiness'), score: analysisResult.readiness_scores.creative, color: 'text-blue-500' },
                                { label: t('onboarding.audience_readiness'), score: analysisResult.readiness_scores.audience, color: 'text-purple-500' },
                                { label: t('onboarding.language_readiness'), score: analysisResult.readiness_scores.language, color: 'text-green-500' }
                            ].map((item, i) => (
                                <div key={i} className="text-center p-4 bg-muted/50 rounded-xl border">
                                    <div className={`text-3xl font-bold ${item.color} mb-1`}>{item.score}%</div>
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Recommendations */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{t('onboarding.recommended_goal')}</h3>
                                <div className="p-4 border rounded-xl bg-primary/5 text-primary font-medium flex items-center shadow-sm">
                                    <CheckCircle className="h-5 w-5 mr-3" />
                                    {analysisResult.recommended_goal.toUpperCase()}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{t('onboarding.recommended_platforms')}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {analysisResult.recommended_platforms.map((p: string) => (
                                        <span key={p} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-full text-sm font-medium border shadow-sm">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{t('onboarding.summary')}</h3>
                            <p className="text-base leading-relaxed text-muted-foreground bg-muted/30 p-4 rounded-xl border">
                                {analysisResult.summary}
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between pt-6 border-t bg-muted/20">
                        <button className={cn(buttonVariants({ variant: "ghost" }))} onClick={() => setStep(1)}>{t('common.back')}</button>
                        <button onClick={() => toast.info("Proceeding to setup...")} className={cn(buttonVariants(), "gap-2")}>
                            {t('onboarding.complete_setup')}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
