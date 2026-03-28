'use client'

export const runtime = 'edge';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Sparkles } from 'lucide-react';

export default function IntelligenceDashboardPage({ params }: { params: { id: string } }) {

    return (
        <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full text-center p-8 bg-kaivo-dark-card border border-white/10">
                <Sparkles className="w-12 h-12 text-kaivo-teal-neon mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
                <p className="text-gray-400">
                    Intelligence metrics are coming soon. Backend route not yet verified.
                </p>
            </Card>
        </div>
    );
}
