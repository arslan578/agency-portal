'use client';

import React from 'react';
import { getUMILabel, getUMITextColor, getUMIBgColor } from '@/types/intelligence';
import { cn } from '@/lib/utils';

interface UMIBadgeProps {
    score: number;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
    className?: string;
}

const sizeClasses = {
    sm: {
        container: 'w-9 h-9 text-xs min-w-[36px]',
        text: 'text-[11px] font-bold',
        label: 'text-xs font-bold',
    },
    md: {
        container: 'w-11 h-11 text-sm min-w-[44px]',
        text: 'text-xs font-bold',
        label: 'text-sm font-semibold',
    },
    lg: {
        container: 'w-14 h-14 text-base min-w-[56px]',
        text: 'text-sm font-bold',
        label: 'text-base font-semibold',
    },
};

export function UMIBadge({ score, size = 'md', showLabel = false, className }: UMIBadgeProps) {
    const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
    const label = getUMILabel(clampedScore);
    const textColor = getUMITextColor(clampedScore);
    const bgClass = getUMIBgColor(clampedScore);
    const sizeConfig = sizeClasses[size];

    return (
        <div 
            className={cn('inline-flex items-center gap-2.5 group', className)}
            title={`UMI Score: ${clampedScore}/100 (${label})`}
        >
            <div
                className={cn(
                    'rounded-full border-2 flex items-center justify-center font-bold',
                    'shadow-md transition-all hover:scale-110 hover:shadow-lg',
                    'ring-1 ring-offset-1 ring-offset-background',
                    sizeConfig.container,
                    bgClass,
                    textColor,
                    // Add ring color based on score
                    clampedScore >= 70 ? 'ring-green-500/20' : 
                    clampedScore >= 50 ? 'ring-yellow-500/20' : 
                    'ring-red-500/20'
                )}
                aria-label={`UMI Score: ${clampedScore} out of 100, ${label}`}
            >
                <span className={cn('leading-none', sizeConfig.text)}>
                    {clampedScore}
                </span>
            </div>
            {showLabel && (
                <span className={cn(
                    'font-bold tracking-wider uppercase',
                    sizeConfig.label,
                    // Use bright white for maximum readability
                    'text-white drop-shadow-sm'
                )}>
                    UMI
                </span>
            )}
        </div>
    );
}
