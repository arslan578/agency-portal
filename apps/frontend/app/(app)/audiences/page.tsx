'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { Plus, Search, Filter, Loader2, Users } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AudienceEditModal } from '@/components/audience/AudienceEditModal';
import { CreateAudienceModal } from '@/components/audience/CreateAudienceModal';
import { Audience } from '@/types/campaign';
import { getDemoAudiences, isDemoMode } from '@/lib/demoData';
import { useAgency } from '@/context/AgencyContext';
import { ClientSelector } from '@/components/agency/ClientSelector';

export default function AudiencesPage() {
    const { currentClient } = useAgency();
    const [audiences, setAudiences] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingAudience, setEditingAudience] = useState<Audience | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);

    useEffect(() => {
        fetchAudiences();
    }, [currentClient?.id]);

    const fetchAudiences = async () => {
        try {
            setLoading(true);
            const url = currentClient?.id
                ? `${API_ENDPOINTS.AUDIENCE.LIST}?client_id=${currentClient.id}`
                : API_ENDPOINTS.AUDIENCE.LIST;
            const data = await apiClient.get<any[]>(url);
            // Map API response to frontend format
            const mappedAudiences = Array.isArray(data)
                ? data.map((audience: any) => ({
                    id: audience.id,
                    name: audience.name,
                    count: audience.estimated_reach || 0,
                    type: audience.definition?.type || 'Custom',
                }))
                : [];
            setAudiences(mappedAudiences);
            
            if (isDemoMode()) {
                // Use demo audiences
                const demoData = getDemoAudiences();
                const mappedAudiences = demoData.map((audience: any) => ({
                    id: audience.id,
                    name: audience.name,
                    count: audience.estimated_reach || 0,
                    type: 'Custom',
                }));
                setAudiences(mappedAudiences);
            } else {
                const data = await apiClient.get<any[]>(API_ENDPOINTS.AUDIENCE.LIST);
                // Map API response to frontend format
                const mappedAudiences = Array.isArray(data)
                    ? data.map((audience: any) => ({
                        id: audience.id,
                        name: audience.name,
                        count: audience.estimated_reach || 0,
                        type: audience.definition?.type || 'Custom',
                    }))
                    : [];
                setAudiences(mappedAudiences);
            }
        } catch (error: any) {
            setAudiences([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAudience = async (payload: {
        client_id: number;
        name: string;
        description?: string;
        definition?: Record<string, unknown>;
    }) => {
        await apiClient.post(API_ENDPOINTS.AUDIENCE.CREATE, {
            client_id: payload.client_id,
            name: payload.name,
            description: payload.description ?? null,
            definition: payload.definition ?? {},
        });
        await fetchAudiences();
        toast.success('Audience created successfully!');
    };

    const handleAudienceUpdate = async (audienceId: number, updates: { name?: string; description?: string; definition?: any }) => {
        try {
            await apiClient.patch(API_ENDPOINTS.AUDIENCE.UPDATE(audienceId.toString()), updates);
            await fetchAudiences();
            setEditModalOpen(false);
            setEditingAudience(null);
            toast.success('Audience updated successfully!');
        } catch (error: any) {
            toast.error(`Failed to update audience: ${error.message || 'Unknown error'}`);
            throw error;
        }
    };

    const handleEditClick = async (audience: any) => {
        try {
            if (isDemoMode()) {
                // Use demo audience data
                const demoAudiences = getDemoAudiences();
                const fullAudience = demoAudiences.find(a => a.id === audience.id) || null;
                setEditingAudience(fullAudience);
                setEditModalOpen(true);
            } else {
                const fullAudience = await apiClient.get<Audience>(API_ENDPOINTS.AUDIENCE.DETAILS(audience.id.toString()));
                setEditingAudience(fullAudience);
                setEditModalOpen(true);
            }
        } catch (error: any) {
            toast.error(`Failed to load audience details: ${error.message || 'Unknown error'}`);
        }
    };

    // Remove mock fallbacks entirely for production wiring correctness
    const displayAudiences = audiences;

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Audiences</h1>
                    <p className="text-gray-400 mt-1">Manage your customer segments</p>
                </div>
                <div className="flex items-center gap-3">
                    <ClientSelector />
                    <button className={cn(buttonVariants(), "gap-2")} onClick={() => setCreateModalOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Create Audience
                </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search audiences..." className="pl-9" />
                </div>
                <button className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
                    <Filter className="h-4 w-4" />
                    Filter
                </button>
            </div>

            {/* Audiences List */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 border-b border-white/10">
                            <tr>
                                <th className="px-6 py-4 font-medium text-gray-400">Name</th>
                                <th className="px-6 py-4 font-medium text-gray-400">Size</th>
                                <th className="px-6 py-4 font-medium text-gray-400">Type</th>
                                <th className="px-6 py-4 font-medium text-gray-400 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : displayAudiences.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                                        Listing not available yet. You can Create Audience only.
                                    </td>
                                </tr>
                            ) : (
                                displayAudiences.map((audience) => (
                                    <tr key={audience.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-500/20 rounded-lg">
                                                    <Users className="h-4 w-4 text-blue-400" />
                                                </div>
                                                <div className="font-medium text-white">{audience.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-400">{audience.count?.toLocaleString() || '-'}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                                                {audience.type || 'Custom'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleEditClick(audience)}
                                                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-gray-400 hover:text-white")}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <CreateAudienceModal
                open={createModalOpen}
                onOpenChange={setCreateModalOpen}
                clientId={currentClient?.id ?? null}
                clientName={currentClient?.name}
                onCreate={handleCreateAudience}
            />
            <AudienceEditModal
                open={editModalOpen}
                onOpenChange={setEditModalOpen}
                audience={editingAudience}
                onSave={handleAudienceUpdate}
            />
        </div>
    );
}