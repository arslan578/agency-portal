'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { Building2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

function AcceptInviteContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    
    const token = searchParams.get('token');
    
    const [status, setStatus] = useState<'loading' | 'accepting' | 'success' | 'error' | 'needs-auth'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (authLoading) return;
        
        if (!token) {
            setStatus('error');
            setMessage('Invalid invite link. No token provided.');
            return;
        }

        if (!isAuthenticated) {
            setStatus('needs-auth');
            setMessage('Please sign in or sign up to accept this invitation.');
            return;
        }

        acceptInvite();
    }, [token, isAuthenticated, authLoading]);

    const acceptInvite = async () => {
        setStatus('accepting');
        try {
            const res = await apiClient.post<{
                success: boolean;
                message: string;
                agency_id?: number;
                role?: string;
            }>(`/invites/accept?token=${token}`, {});
            
            if (res.success) {
                setStatus('success');
                setMessage(res.message);
                
                // Update localStorage with new agency
                if (res.agency_id) {
                    localStorage.setItem('kaivo_agency_id', String(res.agency_id));
                }
                
                // Redirect to dashboard after short delay
                setTimeout(() => {
                    router.push('/dashboard');
                }, 2000);
            } else {
                setStatus('error');
                setMessage(res.message || 'Failed to accept invite');
            }
        } catch (error: any) {
            setStatus('error');
            setMessage(error?.message || error?.detail || 'Failed to accept invite. The link may be expired or invalid.');
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md bg-card/50 border-white/20">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
                        <Building2 className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-xl text-foreground">Agency Invitation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {status === 'loading' || status === 'accepting' ? (
                        <div className="text-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                            <p className="text-foreground/80">
                                {status === 'accepting' ? 'Accepting invitation...' : 'Loading...'}
                            </p>
                        </div>
                    ) : status === 'success' ? (
                        <div className="text-center py-4">
                            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                            <p className="text-foreground font-medium mb-2">Welcome!</p>
                            <p className="text-foreground/80 mb-4">{message}</p>
                            <p className="text-sm text-foreground/60">Redirecting to dashboard...</p>
                        </div>
                    ) : status === 'needs-auth' ? (
                        <div className="text-center py-4">
                            <p className="text-foreground/80 mb-6">{message}</p>
                            <div className="space-y-3">
                                <Link 
                                    href={`/auth/signin?redirect=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`}
                                    className="inline-flex items-center justify-center w-full h-10 px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                                >
                                    Sign In
                                </Link>
                                <Link 
                                    href={`/auth/signup?redirect=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`}
                                    className="inline-flex items-center justify-center w-full h-10 px-6 py-2 rounded-lg text-sm font-medium border border-border bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                                >
                                    Create Account
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                            <p className="text-foreground font-medium mb-2">Unable to Accept</p>
                            <p className="text-foreground/80 mb-6">{message}</p>
                            <Link 
                                href="/dashboard"
                                className="inline-flex items-center justify-center h-10 px-6 py-2 rounded-lg text-sm font-medium border border-border bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                            >
                                Go to Dashboard
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <AcceptInviteContent />
        </Suspense>
    );
}
