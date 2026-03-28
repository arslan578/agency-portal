'use client';

import React from 'react';
import { buttonVariants } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccountPage() {
    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Account Settings</h1>
                <button className={cn(buttonVariants())}>
                    <Plus className="w-4 h-4 mr-2" />
                    Invite Member
                </button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-500">Manage your team members here.</p>
                </CardContent>
            </Card>
        </div>
    );
}
