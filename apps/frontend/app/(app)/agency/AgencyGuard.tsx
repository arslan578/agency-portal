'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * Redirects to /dashboard if the user is not an agency member.
 * Use inside agency layout so /agency/* is only accessible to agency users.
 */
export function AgencyGuard({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const isAgencyUser = Boolean(user?.agency_id);

    useEffect(() => {
        if (loading) return;
        if (!isAgencyUser) {
            router.replace('/dashboard');
        }
    }, [loading, isAgencyUser, router]);

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[200px]">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
        );
    }

    if (!isAgencyUser) {
        return null;
    }

    return <>{children}</>;
}
