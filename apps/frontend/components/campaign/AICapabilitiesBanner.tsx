"use client";

import { Card, CardContent } from '@/components/ui/Card';
import { Sparkles, Brain, Target, Zap } from 'lucide-react';

export function AICapabilitiesBanner() {
    const capabilities = [
        { icon: Brain, text: "Natural Language Understanding" },
        { icon: Target, text: "Intelligent Data Extraction" },
        { icon: Zap, text: "Automatic Resource Creation" },
        { icon: Sparkles, text: "Smart Inferences & Defaults" }
    ];

    return (
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
            <CardContent className="p-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                            Powered by AI
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                        {capabilities.map((cap, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <cap.icon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{cap.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

