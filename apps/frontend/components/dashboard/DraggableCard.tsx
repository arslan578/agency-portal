"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraggableCardProps {
    id: string;
    title: string;
    children: React.ReactNode;
    onRemove?: (id: string) => void;
    className?: string;
}

export function DraggableCard({ id, title, children, onRemove, className }: DraggableCardProps) {
    const [isDragging, setIsDragging] = useState(false);

    return (
        <Card
            className={cn(
                "relative group border-primary/20 transition-all",
                isDragging && "opacity-50 scale-95",
                className
            )}
            draggable
            onDragStart={(e) => {
                setIsDragging(true);
                e.dataTransfer.setData('text/plain', id);
            }}
            onDragEnd={() => setIsDragging(false)}
        >
            <div className="absolute top-2 left-2 cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-gray-400" />
            </div>
            {onRemove && (
                <button
                    onClick={() => onRemove(id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-400"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
            <CardContent className="pt-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">{title}</h3>
                {children}
            </CardContent>
        </Card>
    );
}

