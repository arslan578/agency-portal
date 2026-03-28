"use client";

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/Label';
import { Loader2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { MetaAdAccount } from '@/lib/platforms/meta/adAccountsContract';
import { parseMetaAdAccountsResponse } from '@/lib/platforms/meta/adAccountsContract';

type AdAccount = MetaAdAccount & {
    id: string;
    name: string;
    account_id: string;
};

interface AdAccountSelectorProps {
    accountId: number; // Kaivo account ID
    platform: string;
    selectedAccountId?: string;
    onSelect: (accountId: string) => void;
    disabled?: boolean;
}

export function AdAccountSelector({
    accountId,
    platform,
    selectedAccountId,
    onSelect,
    disabled = false
}: AdAccountSelectorProps) {
    const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supportedPlatforms = ['facebook', 'meta', 'tiktok', 'reddit', 'microsoft_ads', 'spotify'];

    useEffect(() => {
        if (supportedPlatforms.includes(platform)) {
            fetchAdAccounts();
        } else {
            setAdAccounts([]);
        }
    }, [platform, accountId]);

    const fetchAdAccounts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let endpoint = '';
            const encodedId = encodeURIComponent(String(accountId));
            const p = platform === 'facebook' ? 'meta' : platform;

            if (p === 'meta') {
                endpoint = `${API_ENDPOINTS.PLATFORM.META.AD_ACCOUNTS}?account_id=${encodedId}`;
            } else if (p === 'tiktok') {
                endpoint = `${API_ENDPOINTS.PLATFORM.TIKTOK.AD_ACCOUNTS}?account_id=${encodedId}`;
            } else if (p === 'reddit') {
                endpoint = `${API_ENDPOINTS.PLATFORM.REDDIT.AD_ACCOUNTS}?account_id=${encodedId}`;
            } else if (p === 'microsoft_ads') {
                endpoint = `${API_ENDPOINTS.PLATFORM.MICROSOFT_ADS.AD_ACCOUNTS}?account_id=${encodedId}`;
            } else if (p === 'spotify') {
                endpoint = `${API_ENDPOINTS.PLATFORM.SPOTIFY.AD_ACCOUNTS}?account_id=${encodedId}`;
            }

            if (!endpoint) return;

            const raw = await apiClient.get<unknown>(endpoint);
            const response = raw as any; // Using generic type since we handle multiple platforms

            if (response.success) {
                const accounts = (response.ad_accounts || []).filter((a: any): a is AdAccount => {
                    return typeof a === 'object' && a !== null
                        && typeof (a as any).id === 'string'
                        && typeof (a as any).name === 'string'
                        && typeof (a as any).account_id === 'string';
                });

                setAdAccounts(accounts);

                // Auto-select first account if none selected
                if (!selectedAccountId && accounts.length > 0) {
                    onSelect(accounts[0].id);
                }
            } else {
                // Backend returned a failure contract (still read-only, just not successful)
                const errorMsg = response.error || response.message || 'Failed to fetch ad accounts';
                setError(errorMsg);
            }
        } catch (err: any) {
            // Extract error message from API error object
            let errorMsg = 'Failed to load ad accounts';

            // apiClient throws error with status, message, error, etc.
            if (err.status) {
                // This is an ApiError from apiClient.
                // Note: err.error can be a string (backend) OR an object (proxy envelope).
                if (typeof err.error === 'string') {
                    errorMsg = err.error;
                } else if (err.error && typeof err.error === 'object') {
                    errorMsg = err.error.message || err.message || `HTTP ${err.status}: Request failed`;
                } else {
                    errorMsg = err.message || `HTTP ${err.status}: Request failed`;
                }
            } else if (err.message) {
                errorMsg = err.message;
            }

            setError(errorMsg);
            console.error('Error fetching ad accounts:', {
                error: err,
                status: err.status,
                message: errorMsg
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!supportedPlatforms.includes(platform)) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-kaivo-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading ad accounts...</span>
            </div>
        );
    }

    if (error) {
        // Convert error to string if it's not already
        const errorStr = typeof error === 'string' ? error : String(error);

        // Check if it's a missing token error
        const isMissingToken = errorStr.includes("Missing access token") || errorStr.includes("MISSING_TOKEN");

        return (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                    <p className="font-medium">{errorStr}</p>
                    {isMissingToken ? (
                        <p className="text-xs mt-1 opacity-80">
                            Make sure META_ACCESS_TOKEN is set in backend .env file, or connect your Meta Ads account in Settings.
                        </p>
                    ) : (
                        <p className="text-xs mt-1 opacity-80">
                            Go to Settings to connect your {platform} account.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (adAccounts.length === 0) {
        return (
            <div className="text-sm text-kaivo-text-muted">
                No ad accounts found. Make sure your {platform} account has active ad accounts.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor="ad-account-select">Ad Account ({platform})</Label>
            <select
                id="ad-account-select"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                value={selectedAccountId || ''}
                onChange={(e) => onSelect(e.target.value)}
                disabled={disabled}
            >
                <option value="">Select an ad account...</option>
                {adAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                        {account.name} ({account.account_id})
                        {account.currency && ` - ${account.currency}`}
                    </option>
                ))}
            </select>
            {selectedAccountId && (
                <p className="text-xs text-kaivo-text-muted">
                    Selected: {adAccounts.find(a => a.id === selectedAccountId)?.name}
                </p>
            )}
        </div>
    );
}

