"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

interface MetaOAuthButtonProps {
    accountId: number;
    onSuccess?: () => void;
    disabled?: boolean;
}

export function MetaOAuthButton({ accountId, onSuccess, disabled = false }: MetaOAuthButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConnect = async () => {
        setLoading(true);
        setError(null);

        try {
            // Get OAuth URL from backend
            const response = await apiClient.get<{
                success: boolean;
                oauth_url?: string;
                error?: string;
                message?: string;
            }>(API_ENDPOINTS.PLATFORM.META.OAUTH.INITIATE(accountId));

            if (response.success && response.oauth_url) {
                // Redirect to Meta OAuth page
                window.location.href = response.oauth_url;
            } else {
                setError(response.error || response.message || 'Failed to initiate OAuth');
                setLoading(false);
            }
        } catch (err: any) {
            console.error('Meta OAuth initiation error:', err);
            setError(err.message || 'Failed to connect Meta account');
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <Button
                onClick={handleConnect}
                disabled={loading || disabled}
                className="w-full whitespace-nowrap overflow-hidden text-ellipsis bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                            Connect Meta Account
                        </span>
                    </>
                )}
            </Button>
            {error && (
                <p className="text-sm text-red-500">{error}</p>
            )}
        </div>
    );
}

