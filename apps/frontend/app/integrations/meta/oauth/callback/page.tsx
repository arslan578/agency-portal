"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

function MetaOAuthCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const code = searchParams.get('code');
                const state = searchParams.get('state');
                const error = searchParams.get('error');
                const errorReason = searchParams.get('error_reason');
                const errorDescription = searchParams.get('error_description');

                // Handle errors returned by Facebook (user denied, etc.)
                if (error) {
                    setStatus('error');
                    setMessage(errorDescription || errorReason || error);
                    return;
                }

                // Facebook only returns `code` and `state` in the redirect.
                // It does NOT pass back any custom query params like `account_id`.
                // The backend encodes account_id inside the state (format: random_hex|account_id),
                // so we pass state to the backend and it decodes account_id there.
                if (!code || !state) {
                    setStatus('error');
                    setMessage('Missing required OAuth parameters (code or state). Please try connecting again.');
                    return;
                }

                // Forward code + state to the backend callback endpoint.
                // The backend will decode account_id from the state parameter.
                const callbackUrl = `${API_ENDPOINTS.PLATFORM.META.OAUTH.CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
                const response = await apiClient.get<{
                    success: boolean;
                    message?: string;
                    error?: string;
                    warning?: string;
                }>(callbackUrl);

                if (response.success) {
                    setStatus('success');
                    setMessage(response.message || 'Meta account connected successfully!');
                    if (response.warning) {
                        console.warn('Meta OAuth warning:', response.warning);
                    }
                    // Redirect to campaigns page after 2 seconds
                    setTimeout(() => {
                        router.push('/campaigns');
                    }, 2000);
                } else {
                    setStatus('error');
                    setMessage(response.error || response.message || 'Failed to connect Meta account');
                }
            } catch (err: any) {
                console.error('Meta OAuth callback error:', err);
                setStatus('error');
                setMessage(err.message || 'An error occurred during OAuth callback');
            }
        };

        handleCallback();
    }, [searchParams, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-kaivo-card-bg rounded-lg shadow-lg p-8 text-center">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-12 h-12 animate-spin text-kaivo-teal-neon mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">Connecting Meta Account...</h2>
                        <p className="text-gray-400">Please wait while we complete the connection.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">Success!</h2>
                        <p className="text-gray-400 mb-4">{message}</p>
                        <p className="text-sm text-gray-500">Redirecting to campaigns...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">Connection Failed</h2>
                        <p className="text-gray-400 mb-4">{message}</p>
                        <button
                            onClick={() => router.push('/campaigns')}
                            className="px-4 py-2 bg-kaivo-teal-neon text-kaivo-dark-bg rounded-lg hover:opacity-90 transition"
                        >
                            Go to Campaigns
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function MetaOAuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="max-w-md w-full bg-kaivo-card-bg rounded-lg shadow-lg p-8 text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-kaivo-teal-neon mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-white mb-2">Loading...</h2>
                    <p className="text-gray-400">Please wait</p>
                </div>
            </div>
        }>
            <MetaOAuthCallbackContent />
        </Suspense>
    );
}
