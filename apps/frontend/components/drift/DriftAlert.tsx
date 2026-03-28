"use client";

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import { AlertTriangle, CheckCircle, ArrowRight, MessageSquare, XCircle, Info, X } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { toast } from 'sonner';

import { apiClient as api } from '@/lib/api/client';

interface DriftAlertItem {
    id: string;
    campaign_name: string;
    explanation: string;
    severity: 'low' | 'medium' | 'high';
    platform: string;
    detected_at: string;
}

export function DriftAlert() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [drift, setDrift] = useState<DriftAlertItem | null>(null);

    useEffect(() => {
        const fetchDrift = async () => {
            try {
                const res = await api.get<DriftAlertItem[]>('/drift/alerts');
                // Assuming API returns a list
                if (res && res.length > 0) {
                    setDrift(res[0]);
                }
            } catch (e) {
                console.error("Failed to fetch drift alerts", e);
            }
        };
        fetchDrift();
    }, []);

    if (!drift) return null;

    const severityColor = {
        low: "bg-yellow-500/10 text-yellow-600 border-yellow-500/50 dark:text-yellow-400",
        medium: "bg-orange-500/10 text-orange-600 border-orange-500/50 dark:text-orange-400",
        high: "bg-red-500/10 text-red-600 border-red-500/50 dark:text-red-400"
    }[drift.severity as 'low' | 'medium' | 'high'] || "bg-gray-500/10 text-gray-600 border-gray-500/50";

    const handleFix = async () => {
        try {
            await api.post(`/drift/fix/${drift.id}`, {});
            setOpen(false);
            setDrift(null);
            toast.success("Fix applied via Orchestrator!");
        } catch (e) {
            console.error("Failed to apply fix", e);
            toast.error("Failed to apply fix.");
        }
    };

    return (
        <>
            <div className={`mb-4 p-4 rounded-lg border flex items-start gap-4 ${severityColor} shadow-sm`}>
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="flex-1">
                    <div className="font-bold flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            {t('drift.title')}: {drift.campaign_name}
                            <span className="text-[10px] uppercase border px-1 rounded bg-background/50">{drift.severity}</span>
                        </span>
                        <button
                            className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0 font-semibold underline-offset-4")}
                            onClick={() => setOpen(true)}
                        >
                            {t('drift.resolve_action')} <ArrowRight className="ml-1 h-3 w-3" />
                        </button>
                    </div>
                    <div className="mt-1 opacity-90 text-sm">
                        {drift.explanation}
                    </div>
                </div>
            </div>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-background w-full max-w-[500px] rounded-xl shadow-lg border p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col space-y-2 text-center sm:text-left">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                                    <AlertTriangle className="h-5 w-5" />
                                    {t('drift.dialog_title')}
                                </h2>
                                <button className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-6 w-6")} onClick={() => setOpen(false)}>
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t('drift.dialog_desc')}
                            </p>
                        </div>

                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border">
                                <div>
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('drift.campaign')}</span>
                                    <div className="font-medium">{drift.campaign_name}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('drift.platform')}</span>
                                    <div className="font-medium">{drift.platform}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('drift.severity')}</span>
                                    <div className="font-medium uppercase text-red-600 font-bold">{drift.severity}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('drift.detected')}</span>
                                    <div className="font-medium">{new Date(drift.detected_at).toLocaleTimeString()}</div>
                                </div>
                            </div>

                            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-md text-sm border border-red-100 dark:border-red-900/30">
                                <div className="flex items-start gap-2">
                                    <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                                    <div>
                                        <span className="font-semibold text-red-900 dark:text-red-200">{t('drift.issue')}:</span>
                                        <p className="text-red-800 dark:text-red-300 mt-1">{drift.explanation}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
                            <button className={cn(buttonVariants({ variant: "ghost" }), "mr-auto")} onClick={() => toast.info("Opening chat...")}>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                {t('drift.ask_ai')}
                            </button>

                            <button className={cn(buttonVariants({ variant: "outline" }))} onClick={() => setOpen(false)}>{t('drift.ignore')}</button>
                            <button onClick={handleFix} className={cn(buttonVariants(), "bg-red-600 hover:bg-red-700 text-white")}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {t('drift.auto_fix')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
