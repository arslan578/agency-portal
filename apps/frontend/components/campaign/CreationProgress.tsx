"use client";

import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { Sparkles } from 'lucide-react';

interface CreationProgressProps {
    steps: string[];
    currentStep: number;
}

export function CreationProgress({ steps, currentStep }: CreationProgressProps) {
    return (
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
            <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                    <h3 className="text-lg font-semibold text-foreground">AI is creating your campaign...</h3>
                </div>
                <div className="space-y-4">
                    {steps.map((step, index) => {
                        const isCompleted = index < currentStep;
                        const isCurrent = index === currentStep;
                        const isPending = index > currentStep;

                        return (
                            <div key={index} className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                    isCompleted 
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                                        : isCurrent
                                        ? 'bg-primary/20 text-primary border border-primary/30 animate-pulse'
                                        : 'bg-gray-500/20 text-gray-500 border border-gray-500/30'
                                }`}>
                                    {isCompleted ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : isCurrent ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Circle className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="flex-1 pt-1">
                                    <div className={`text-sm font-medium transition-colors ${
                                        isCompleted 
                                            ? 'text-foreground' 
                                            : isCurrent
                                            ? 'text-primary'
                                            : 'text-gray-500'
                                    }`}>
                                        {step}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

