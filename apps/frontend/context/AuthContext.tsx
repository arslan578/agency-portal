'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

export type User = {
    id: number;
    email: string;
    full_name?: string | null;
    phone_number?: string | null;
    company_name?: string | null;
    is_active: boolean;
    is_superuser: boolean;
    tier?: string;
    agency_id?: string | null;
    agency_name?: string | null;
    agency_role?: string | null;
    agency_credits?: number;
    google_id?: string | null;
};

type AuthContextType = {
    isAuthenticated: boolean;
    loading: boolean;
    user: User | null; // Added user object
    checkAuth: () => Promise<void>;
    refreshUser: () => Promise<void>; // Alias for checkAuth
    logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    loading: true,
    user: null,
    checkAuth: async () => { },
    refreshUser: async () => { },
    logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null); // State for user
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    const getTokenExpiration = (token: string): number | null => {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
        } catch {
            return null;
        }
    };

    const refreshTokenIfNeeded = async () => {
        if (typeof localStorage === 'undefined') return;

        const token = localStorage.getItem('kaivo_token');
        if (!token) return;

        const expiration = getTokenExpiration(token);
        if (!expiration) return;

        const now = Date.now();
        const timeUntilExpiry = expiration - now;
        const REFRESH_BEFORE_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes before expiry
        const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period after expiry

        // Refresh if token expires within 3 minutes OR expired within grace period (5 minutes)
        const shouldRefresh = (timeUntilExpiry > 0 && timeUntilExpiry < REFRESH_BEFORE_EXPIRY_MS) ||
                             (timeUntilExpiry < 0 && Math.abs(timeUntilExpiry) < GRACE_PERIOD_MS);

        if (shouldRefresh) {
            try {
                const response = await apiClient.post<{ access_token: string }>(
                    API_ENDPOINTS.AUTH.REFRESH,
                    {},
                    { skipAuth: false }
                );
                if (response.access_token) {
                    localStorage.setItem('kaivo_token', response.access_token);
                }
            } catch (error) {
                // If refresh fails, checkAuth will handle it on next API call
                console.warn('Token refresh failed:', error);
            }
        }
    };

    const checkAuth = async () => {
        if (typeof localStorage === 'undefined') {
            setLoading(false);
            return;
        }

        const token = localStorage.getItem('kaivo_token');
        if (!token) {
            setIsAuthenticated(false);
            setUser(null);
            setLoading(false);
            return;
        }

        // Frontend-only demo mode: bypass backend for demo token
        if (token === 'demo-token') {
            setIsAuthenticated(true);
            setUser({
                id: 0,
                email: 'demo@kaivo.com',
                full_name: 'Demo User',
                phone_number: null,
                company_name: 'Kaivo Demo Account',
                is_active: true,
                is_superuser: false,
                tier: 'demo',
                agency_id: null,
                agency_name: null,
                agency_role: null,
                agency_credits: 0,
                google_id: null,
            });
            setLoading(false);
            return;
        }

        try {
            // Validate token via /auth/me
            const res = await apiClient.get<User>(API_ENDPOINTS.AUTH.ME);
            // If get succeeds (200), we are authenticated.
            setIsAuthenticated(true);
            setUser(res); // Store full user object
        } catch (error) {
            console.warn('Auth validation failed:', error);
            localStorage.removeItem('kaivo_token');
            setIsAuthenticated(false);
            setUser(null);
            // Only redirect if on a protected route to avoid loops on public pages
            // NEVER redirect when inside the Shopify embedded app — it uses session tokens, not Kaivo tokens
            if (!pathname.startsWith('/auth') && !pathname.startsWith('/public') && !pathname.startsWith('/integrations/shopify')) {
                router.push('/auth/signin');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []); // Only check auth on mount, not on every route change

    const logout = () => {
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        router.push('/auth/signin');
    };

    useEffect(() => {
        if (!isAuthenticated || loading) return;

        // Set up proactive token refresh interval
        // Check every 5 minutes if token needs refreshing
        const interval = setInterval(() => {
            refreshTokenIfNeeded();
        }, 5 * 60 * 1000); // Check every 5 minutes

        // Also check immediately after auth check completes
        refreshTokenIfNeeded();

        return () => clearInterval(interval);
    }, [isAuthenticated, loading]);

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, user, checkAuth, refreshUser: checkAuth, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
