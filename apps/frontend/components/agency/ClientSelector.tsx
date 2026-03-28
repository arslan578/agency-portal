"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Users } from 'lucide-react';
import { useAgency, Client } from '@/context/AgencyContext';

interface ClientSelectorProps {
    selectedClientId?: string;
    onSelect?: (id: string) => void;
}

export function ClientSelector({ selectedClientId: externalId, onSelect: externalOnSelect }: ClientSelectorProps) {
    const { clients, currentClient, setCurrentClient, loading } = useAgency();
    
    const selectedId = externalId || (currentClient?.id ? String(currentClient.id) : '');
    
    const handleSelect = (id: string) => {
        const client = clients.find(c => String(c.id) === id);
        if (client) {
            setCurrentClient(client);
        }
        if (externalOnSelect) {
            externalOnSelect(id);
        }
    };

    if (loading) {
        return (
            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Active Client Context
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground">Loading clients...</div>
                </CardContent>
            </Card>
        );
    }

    if (clients.length === 0) {
        return (
            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Active Client Context
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground">No clients found. Create your first client in Agency Settings.</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="mb-6">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Active Client Context
                </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
                <Select value={selectedId} onValueChange={handleSelect}>
                    <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                        {clients.map(client => (
                            <SelectItem key={client.id} value={String(client.id)}>
                                {client.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {currentClient && (
                    <div className="text-sm text-muted-foreground">
                        Active: <span className="font-semibold text-primary">{currentClient.name}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
