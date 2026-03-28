"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Settings, GripVertical, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DashboardCard {
    id: string;
    title: string;
    component: React.ReactNode;
    visible: boolean;
    order: number;
}

interface InterchangeableCardsProps {
    cards: DashboardCard[];
    onCardsChange?: (cards: DashboardCard[]) => void;
}

export function InterchangeableCards({ cards: initialCards, onCardsChange }: InterchangeableCardsProps) {
    const [cards, setCards] = useState<DashboardCard[]>(initialCards);
    const [isEditing, setIsEditing] = useState(false);
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [swapAnimating, setSwapAnimating] = useState<{ a: string; b: string } | null>(null);
    const dragCounter = useRef<Record<string, number>>({});

    useEffect(() => {
        const savedOrder = localStorage.getItem('kaivo_dashboard_card_order');
        if (savedOrder) {
            try {
                const orderMap = JSON.parse(savedOrder);
                setCards(prev => prev.map(card => ({
                    ...card,
                    order: orderMap[card.id]?.order ?? card.order,
                    visible: orderMap[card.id]?.visible ?? card.visible
                })).sort((a, b) => a.order - b.order));
            } catch (e) {
                console.error('Failed to load card order:', e);
            }
        }
    }, []);

    const saveCardOrder = (newCards: DashboardCard[]) => {
        const orderMap: Record<string, { order: number; visible: boolean }> = {};
        newCards.forEach(card => {
            orderMap[card.id] = { order: card.order, visible: card.visible };
        });
        localStorage.setItem('kaivo_dashboard_card_order', JSON.stringify(orderMap));
        onCardsChange?.(newCards);
    };

    const handleDragStart = (e: React.DragEvent, cardId: string) => {
        setDraggedCardId(cardId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardId);
        const el = e.currentTarget as HTMLElement;
        requestAnimationFrame(() => el.classList.add('opacity-40'));
    };

    const handleDragEnd = () => {
        setDraggedCardId(null);
        setDropTargetId(null);
        dragCounter.current = {};
    };

    const handleDragEnter = (e: React.DragEvent, cardId: string) => {
        e.preventDefault();
        dragCounter.current[cardId] = (dragCounter.current[cardId] || 0) + 1;
        if (draggedCardId && draggedCardId !== cardId) {
            setDropTargetId(cardId);
        }
    };

    const handleDragLeave = (e: React.DragEvent, cardId: string) => {
        e.preventDefault();
        dragCounter.current[cardId] = (dragCounter.current[cardId] || 0) - 1;
        if (dragCounter.current[cardId] <= 0) {
            dragCounter.current[cardId] = 0;
            if (dropTargetId === cardId) setDropTargetId(null);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetCardId: string) => {
        e.preventDefault();
        if (!draggedCardId || draggedCardId === targetCardId) {
            handleDragEnd();
            return;
        }

        const draggedCard = cards.find(c => c.id === draggedCardId);
        const targetCard = cards.find(c => c.id === targetCardId);
        if (!draggedCard || !targetCard) { handleDragEnd(); return; }

        setSwapAnimating({ a: draggedCardId, b: targetCardId });

        const newCards = cards.map(card => {
            if (card.id === draggedCardId) return { ...card, order: targetCard.order };
            if (card.id === targetCardId) return { ...card, order: draggedCard.order };
            return card;
        }).sort((a, b) => a.order - b.order);

        setTimeout(() => {
            setCards(newCards);
            saveCardOrder(newCards);
            setSwapAnimating(null);
        }, 200);

        handleDragEnd();
    };

    const toggleCardVisibility = (cardId: string) => {
        const newCards = cards.map(card =>
            card.id === cardId ? { ...card, visible: !card.visible } : card
        );
        setCards(newCards);
        saveCardOrder(newCards);
    };

    const visibleCards = cards.filter(c => c.visible).sort((a, b) => a.order - b.order);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-foreground">Performance Overview</h2>
                    <span className="text-xs text-gray-500 hidden md:flex items-center gap-1">
                        <ArrowLeftRight className="h-3 w-3" /> Drag to swap
                    </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="gap-2"
                >
                    <Settings className="h-4 w-4" />
                    {isEditing ? 'Done' : 'Customize'}
                </Button>
            </div>

            {isEditing && (
                <Card className="p-4 bg-muted/30 border-primary/20">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Card Visibility</h3>
                    <div className="space-y-2">
                        {cards.map(card => (
                            <label
                                key={card.id}
                                className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={card.visible}
                                    onChange={() => toggleCardVisibility(card.id)}
                                    className="rounded"
                                />
                                <span className="text-sm text-muted-foreground">{card.title}</span>
                            </label>
                        ))}
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {visibleCards.map(card => (
                    <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragEnd={handleDragEnd}
                        onDragEnter={(e) => handleDragEnter(e, card.id)}
                        onDragLeave={(e) => handleDragLeave(e, card.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, card.id)}
                        className={cn(
                            "relative transition-all duration-200 group/card",
                            draggedCardId === card.id && "opacity-40 scale-95",
                            dropTargetId === card.id && draggedCardId && "scale-[1.02]",
                            swapAnimating && (swapAnimating.a === card.id || swapAnimating.b === card.id) && "scale-95 opacity-60",
                        )}
                    >
                        {/* Drop target ring */}
                        <div className={cn(
                            "absolute -inset-1 rounded-xl border-2 border-dashed transition-all duration-200 pointer-events-none z-10",
                            dropTargetId === card.id && draggedCardId
                                ? "border-primary/60 bg-primary/5"
                                : "border-transparent"
                        )} />

                        {/* Drag handle indicator */}
                        <div className="absolute top-3 left-3 z-10 opacity-0 group-hover/card:opacity-60 transition-opacity cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-4 w-4 text-gray-400" />
                        </div>

                        {card.component}
                    </div>
                ))}
            </div>
        </div>
    );
}

