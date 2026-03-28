"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

function MicrosoftOAuthCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const calledRef = useRef(false);

    useEffect(() => {
        if (calledRef.current) return;
        calledRef.current = true;

        const handleCallback = async () => {
            try {
                const code = searchParams.get('code');
                const state = searchParams.get('state');
                const error = searchParams.get('error');
                const errorDescription = searchParams.get('error_description');

                if (error) {
                    setStatus('error');
                    setMessage(errorDescription || error);
                    return;
                }

                if (!code || !state) {
                    setStatus('error');
                    setMessage('Missing required OAuth parameters (code or state). Please try connecting again.');
                    return;
                }

                const callbackUrl = `${API_ENDPOINTS.PLATFORM.MICROSOFT_ADS.OAUTH.CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
                const response = await apiClient.get<{
                    success: boolean;
                    message?: string;
                    error?: string;
                }>(callbackUrl);

                if (response.success) {
                    setStatus('success');
                    setMessage(response.message || 'Microsoft Ads account connected successfully!');
                    setTimeout(() => {
                        router.push('/campaigns');
                    }, 2000);
                } else {
                    setStatus('error');
                    setMessage(response.error || response.message || 'Failed to connect Microsoft Ads account');
                }
            } catch (err: any) {
                console.error('Microsoft OAuth callback error:', err);
                setStatus('error');
                setMessage(err.message || 'An error occurred during OAuth callback');
            }
        };

        handleCallback();
    }, [searchParams]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-kaivo-card-bg rounded-lg shadow-lg p-8 text-center">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-12 h-12 animate-spin text-kaivo-teal-neon mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">Connecting Microsoft Ads...</h2>
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

export default function MicrosoftOAuthCallbackPage() {
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
            <MicrosoftOAuthCallbackContent />
        </Suspense>
    );
}
