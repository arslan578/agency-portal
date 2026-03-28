"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Loader2, Unplug, Shield, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { GenericOAuthButton } from '@/components/platform/GenericOAuthButton';
import { AdAccountSelector } from '@/components/platform/AdAccountSelector';

interface PlatformConnectionCardProps {
    platform: string;
    name: string;
    icon?: React.ReactNode;
    accountId: number;
}

// Platform accent colors for the glow + gradient decorations
const platformAccents: Record<string, { gradient: string; glow: string; solid: string; text: string }> = {
    meta: { gradient: 'from-blue-500/20 to-indigo-500/20', glow: 'rgba(59,130,246,0.35)', solid: '#3B82F6', text: 'text-blue-500' },
    google_ads: { gradient: 'from-emerald-500/20 to-green-500/20', glow: 'rgba(16,185,129,0.35)', solid: '#10B981', text: 'text-emerald-500' },
    tiktok: { gradient: 'from-pink-500/20 to-rose-500/20', glow: 'rgba(236,72,153,0.35)', solid: '#EC4899', text: 'text-pink-500' },
    reddit: { gradient: 'from-orange-500/20 to-amber-500/20', glow: 'rgba(249,115,22,0.35)', solid: '#F97316', text: 'text-orange-500' },
    microsoft_ads: { gradient: 'from-sky-500/20 to-cyan-500/20', glow: 'rgba(14,165,233,0.35)', solid: '#0EA5E9', text: 'text-sky-500' },
    spotify: { gradient: 'from-green-500/20 to-lime-500/20', glow: 'rgba(34,197,94,0.35)', solid: '#22C55E', text: 'text-green-500' },
};

const defaultAccent = { gradient: 'from-teal-500/20 to-cyan-500/20', glow: 'rgba(20,184,166,0.35)', solid: '#14B8A6', text: 'text-teal-500' };

export function PlatformConnectionCard({ platform, name, icon, accountId }: PlatformConnectionCardProps) {
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [accessToken, setAccessToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<any>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [selectedAdAccount, setSelectedAdAccount] = useState<string | undefined>(undefined);
    const [isSavingAdAccount, setIsSavingAdAccount] = useState(false);

    const accent = platformAccents[platform] || defaultAccent;

    // Dynamic connection status check — calls the backend API on mount
    useEffect(() => {
        checkConnectionStatus();
    }, [platform, accountId]);

    const checkConnectionStatus = async () => {
        try {
            setIsLoading(true);
            const endpoint = API_ENDPOINTS.PLATFORM.CREDENTIALS.GET(platform, accountId);
            const credentials = await apiClient.get(endpoint) as { success?: boolean; credentials?: { access_token?: string, ad_account_id?: string } };
            setIsConnected(credentials.success === true && !!credentials.credentials?.access_token);
            if (credentials.success && credentials.credentials?.ad_account_id) {
                setSelectedAdAccount(credentials.credentials.ad_account_id);
            }
        } catch (error: any) {
            if (error.status !== 404) {
                console.error('Error checking connection:', error);
            }
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectAdAccount = async (adAccountId: string) => {
        try {
            setIsSavingAdAccount(true);
            setSelectedAdAccount(adAccountId);
            // Ignore if endpoint function is missing locally when hot reloading
            if (API_ENDPOINTS.PLATFORM.CREDENTIALS.SELECT_ACCOUNT) {
                const endpoint = API_ENDPOINTS.PLATFORM.CREDENTIALS.SELECT_ACCOUNT(platform, accountId);
                await apiClient.post(endpoint, { ad_account_id: adAccountId });
            }
        } catch (error: any) {
            console.error('Error saving ad account selection:', error);
            setError('Failed to save ad account selection.');
        } finally {
            setIsSavingAdAccount(false);
        }
    };

    const handleTestConnection = async () => {
        if (!accessToken.trim()) {
            setError('Please enter an access token');
            return;
        }

        try {
            setIsConnecting(true);
            setError(null);
            setTestResult(null);

            const result = await apiClient.post(
                API_ENDPOINTS.PLATFORM.META.TEST_CONNECTION,
                { access_token: accessToken }
            ) as { success?: boolean; error?: string; user?: { name: string; id: string }; ad_accounts_count?: number };

            if (result.success) {
                setTestResult(result);
            } else {
                setError(result.error || 'Connection test failed');
            }
        } catch (error: any) {
            setError(error.message || 'Failed to test connection');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleConnect = async () => {
        if (!accessToken.trim()) {
            setError('Please enter an access token');
            return;
        }

        try {
            setIsConnecting(true);
            setError(null);

            const storeEndpoint = `${API_ENDPOINTS.PLATFORM.CREDENTIALS.STORE}?client_id=${accountId}`;
            await apiClient.post(
                storeEndpoint,
                { platform, access_token: accessToken }
            );

            setIsConnected(true);
            setIsDialogOpen(false);
            setAccessToken('');
            setTestResult(null);
        } catch (error: any) {
            setError(error.message || 'Failed to connect platform');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            setIsConnecting(true);
            setError(null);
            const endpoint = API_ENDPOINTS.PLATFORM.CREDENTIALS.REVOKE(platform, accountId);
            await apiClient.delete(endpoint);
            setIsConnected(false);
        } catch (error: any) {
            setError(error.message || 'Failed to disconnect platform');
        } finally {
            setIsConnecting(false);
            setIsConfirmOpen(false);
        }
    };

    return (
        <div
            className="group relative rounded-2xl border border-border/40 dark:border-white/[0.08] overflow-hidden transition-all duration-500 ease-out"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: 'rgb(var(--card))',
                boxShadow: isHovered
                    ? `0 20px 60px -12px ${accent.glow}, 0 0 0 1px ${accent.glow}`
                    : '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
            }}
        >
            {/* Animated gradient orb in top-right */}
            <div
                className={`absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br ${accent.gradient} blur-3xl transition-all duration-700 ease-out pointer-events-none`}
                style={{
                    opacity: isHovered ? 0.8 : 0.3,
                    transform: isHovered ? 'scale(1.5)' : 'scale(1)',
                }}
            />

            {/* Subtle grid pattern overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.04]"
                style={{
                    backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
            />

            {/* Content */}
            <div className="relative z-10 p-6 flex flex-col h-full" style={{ minHeight: '280px' }}>

                {/* Header row: Icon + Title + Status */}
                <div className="flex items-start justify-between mb-4">
                    {/* Icon + Title inline */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Platform logo */}
                        <div
                            className="relative flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 transition-all duration-500 group-hover:scale-110"
                            style={{
                                boxShadow: isHovered ? `0 4px 20px ${accent.glow}` : 'none',
                            }}
                        >
                            {icon || <Zap className="w-5 h-5" />}
                        </div>
                        {/* Title */}
                        <h3 className="font-bold text-[16px] leading-tight tracking-tight text-foreground min-w-0">
                            {name}
                        </h3>
                    </div>

                    {/* Status Badge — Dynamically resolved via API call */}
                    <div className="flex-shrink-0 ml-2">
                        {isLoading ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Checking...
                            </span>
                        ) : isConnected ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 dark:border-emerald-400/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                </span>
                                Connected
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-muted-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                                Offline
                            </span>
                        )}
                    </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    {isConnected
                        ? 'Your account is connected and ready for campaigns'
                        : `Connect your ${name} account to start launching ads`}
                </p>

                {/* Separator */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-border/60 dark:via-white/10 to-transparent mb-4" />

                {/* Feature highlights */}
                <div className="flex items-center gap-3 mb-6 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Shield className="w-3 h-3" />
                        <span>Encrypted</span>
                    </div>
                    <div className="w-px h-3 bg-border/60 dark:bg-white/10" />
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Zap className="w-3 h-3" />
                        <span>Auto-sync</span>
                    </div>
                </div>

                {/* Action area */}
                <div className="mt-auto">
                    {isConnected ? (
                        <>
                            {/* Ad Account Selector */}
                            <div className="mb-4">
                                <AdAccountSelector
                                    accountId={accountId}
                                    platform={platform}
                                    selectedAccountId={selectedAdAccount}
                                    onSelect={handleSelectAdAccount}
                                    disabled={isSavingAdAccount || isConnecting}
                                />
                            </div>
                            <button
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-border/60 dark:border-white/10 text-foreground bg-transparent hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/30 hover:text-red-600 dark:hover:text-red-400 transition-all duration-300"
                                onClick={() => setIsConfirmOpen(true)}
                                disabled={isConnecting}
                            >
                                {isConnecting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Disconnecting...
                                    </>
                                ) : (
                                    <>
                                        <Unplug className="h-4 w-4" />
                                        Disconnect
                                    </>
                                )}
                            </button>

                            {/* Disconnect confirmation dialog */}
                            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                                <DialogContent className="sm:max-w-[420px]">
                                    <DialogHeader>
                                        <DialogTitle>Disconnect {name}?</DialogTitle>
                                        <DialogDescription>
                                            This will remove your <span className="font-medium text-foreground">{name}</span> connection.
                                            You will need to reconnect to use this platform again.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex gap-3 mt-4 justify-end">
                                        <button
                                            className="px-4 py-2 rounded-lg text-sm font-medium border border-border/60 dark:border-white/10 text-foreground hover:bg-white/5 transition-colors"
                                            onClick={() => setIsConfirmOpen(false)}
                                            disabled={isConnecting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                                            onClick={handleDisconnect}
                                            disabled={isConnecting}
                                        >
                                            {isConnecting ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Disconnecting...
                                                </>
                                            ) : (
                                                <>
                                                    <Unplug className="h-3.5 w-3.5" />
                                                    Disconnect
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <GenericOAuthButton platform={platform} name={name} accountId={accountId} icon={icon} />
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogContent className="sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Connect {name}</DialogTitle>
                                        <DialogDescription>
                                            Enter your {name} access token to connect your account.
                                            Your credentials will be encrypted and stored securely.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="access-token">Access Token</Label>
                                            <Input
                                                id="access-token"
                                                type="password"
                                                placeholder="Enter your access token"
                                                value={accessToken}
                                                onChange={(e) => setAccessToken(e.target.value)}
                                                disabled={isConnecting}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Get your access token from the {name} developer portal
                                            </p>
                                        </div>

                                        {error && (
                                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm">
                                                {error}
                                            </div>
                                        )}

                                        {testResult && (
                                            <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-3 rounded-lg text-sm">
                                                <p className="font-medium">Connection successful!</p>
                                                <p className="text-xs mt-1">
                                                    User: {testResult.user?.name} ({testResult.user?.id})
                                                </p>
                                                {testResult.ad_accounts_count > 0 && (
                                                    <p className="text-xs mt-1">
                                                        {testResult.ad_accounts_count} ad account(s) found
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={handleTestConnection}
                                                disabled={isConnecting || !accessToken.trim()}
                                                className="flex-1"
                                            >
                                                {isConnecting ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Testing...
                                                    </>
                                                ) : (
                                                    'Test Connection'
                                                )}
                                            </Button>
                                            <Button
                                                onClick={handleConnect}
                                                disabled={isConnecting || !accessToken.trim() || !testResult?.success}
                                                className="flex-1"
                                            >
                                                {isConnecting ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Connecting...
                                                    </>
                                                ) : (
                                                    'Connect'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
