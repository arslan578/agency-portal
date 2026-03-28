'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function SignoutPage() {
    useEffect(() => {
        const performLogout = async () => {
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem('kaivo_token');
                }
            } catch (error) {
                console.error('Logout error:', error);
            } finally {
                window.location.href = '/auth/signin';
            }
        };

        performLogout();
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-gray-400">Signing out...</p>
        </div>
    );
}
