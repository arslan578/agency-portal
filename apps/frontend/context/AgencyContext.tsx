'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/api/client';

export type Client = {
    id: number;
    agency_id: number;
    name: string;
    industry?: string | null;
    website?: string | null;
    is_active: boolean;
    account_mode?: string; // 'kaivo_managed' | 'reporting_only'
};

export type Agency = {
    id: number;
    name: string;
    current_plan: string;
    credits: number;
    billing_status: string;
    stripe_customer_id?: string | null;
};

type AgencyContextType = {
    agency: Agency | null;
    agencyId: number | null;
    clients: Client[];
    currentClient: Client | null;
    setCurrentClient: (client: Client | null) => void;
    credits: number;
    tier: string;
    role: string | null;
    isAdmin: boolean;
    canEdit: boolean;
    loading: boolean;
    refreshAgency: () => Promise<void>;
    refreshClients: () => Promise<void>;
};

const AgencyContext = createContext<AgencyContextType>({
    agency: null,
    agencyId: null,
    clients: [],
    currentClient: null,
    setCurrentClient: () => {},
    credits: 0,
    tier: 'free',
    role: null,
    isAdmin: false,
    canEdit: false,
    loading: true,
    refreshAgency: async () => {},
    refreshClients: async () => {},
});

const CURRENT_CLIENT_KEY = 'kaivo_current_client_id';
const AGENCY_ID_KEY = 'kaivo_agency_id';

export function AgencyProvider({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const [agency, setAgency] = useState<Agency | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [currentClient, setCurrentClientState] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);

    const agencyId = user?.agency_id ? parseInt(user.agency_id) : null;
    
    useEffect(() => {
        if (typeof localStorage !== 'undefined') {
            if (agencyId) {
                localStorage.setItem(AGENCY_ID_KEY, String(agencyId));
            } else {
                localStorage.removeItem(AGENCY_ID_KEY);
            }
        }
    }, [agencyId]);
    const credits = user?.agency_credits || 0;
    const tier = user?.tier?.replace('TIER_', '').toLowerCase() || 'free';
    const role = user?.agency_role || null;
    const isAdmin = role === 'agency_admin';
    const canEdit = role === 'agency_admin' || role === 'agency_member';

    const refreshAgency = useCallback(async () => {
        if (!agencyId) {
            setAgency(null);
            return;
        }

        try {
            const res = await apiClient.get<Agency>(`/agencies/${agencyId}`);
            setAgency(res);
        } catch (error) {
            console.error('Failed to fetch agency:', error);
            if (user) {
                setAgency({
                    id: agencyId,
                    name: user.agency_name || 'My Agency',
                    current_plan: tier,
                    credits: credits,
                    billing_status: 'active'
                });
            }
        }
    }, [agencyId, user, tier, credits]);

    const refreshClients = useCallback(async () => {
        if (!agencyId) {
            setClients([]);
            return;
        }

        try {
            const res = await apiClient.get<Client[]>(`/clients?agency_id=${agencyId}`);
            setClients(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error('Failed to fetch clients:', error);
            setClients([]);
        }
    }, [agencyId]);

    const setCurrentClient = useCallback((client: Client | null) => {
        setCurrentClientState(client);
        if (typeof localStorage !== 'undefined') {
            if (client) {
                localStorage.setItem(CURRENT_CLIENT_KEY, String(client.id));
            } else {
                localStorage.removeItem(CURRENT_CLIENT_KEY);
            }
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated || !agencyId) {
            setAgency(null);
            setClients([]);
            setCurrentClientState(null);
            setLoading(false);
            return;
        }

        const init = async () => {
            setLoading(true);
            await Promise.all([refreshAgency(), refreshClients()]);
            setLoading(false);
        };

        init();
    }, [isAuthenticated, agencyId, authLoading, refreshAgency, refreshClients]);

    useEffect(() => {
        if (clients.length === 0) {
            setCurrentClientState(null);
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(CURRENT_CLIENT_KEY);
            }
            return;
        }

        const savedClientId = typeof localStorage !== 'undefined' 
            ? localStorage.getItem(CURRENT_CLIENT_KEY) 
            : null;

        if (savedClientId) {
            const saved = clients.find(c => c.id === parseInt(savedClientId));
            if (saved) {
                setCurrentClientState(saved);
                return;
            }
        }

        setCurrentClientState(clients[0]);
    }, [clients]);

    return (
        <AgencyContext.Provider value={{
            agency,
            agencyId,
            clients,
            currentClient,
            setCurrentClient,
            credits,
            tier,
            role,
            isAdmin,
            canEdit,
            loading,
            refreshAgency,
            refreshClients
        }}>
            {children}
        </AgencyContext.Provider>
    );
}

export const useAgency = () => useContext(AgencyContext);
