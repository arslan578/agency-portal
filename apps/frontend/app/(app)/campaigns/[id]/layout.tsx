"use client";

import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Campaign } from '@/types/campaign';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export default function CampaignDetailLayout({ children, params }: { 
    children: React.ReactNode; 
    params: { id: string };
}) {
    const pathname = usePathname();
    const router = useRouter();
    
    // Fetch campaign for header
    const { data: campaign } = useSWR<Campaign>(
        `/campaigns/${params.id}`,
        () => apiClient.get(API_ENDPOINTS.CAMPAIGN.DETAILS(params.id)),
        { revalidateOnFocus: false }
    );

    const steps = [
        { label: 'Overview', href: `/campaigns/${params.id}` },
        { label: 'Targeting', href: `/campaigns/${params.id}/targeting` },
        { label: 'Create Ad Copy', href: `/campaigns/${params.id}/creative` },
        { label: 'Launch', href: `/campaigns/${params.id}/launch` },
        { label: 'Reporting', href: `/campaigns/${params.id}/reporting` },
    ];

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'ACTIVE':
                return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'PAUSED':
                return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'DRAFT':
                return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'COMPLETED':
                return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
            default:
                return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    return (
        <div className="space-y-6 p-8">
            {/* Back button */}
            <Button 
                variant="ghost" 
                onClick={() => router.push('/campaigns')}
                className="gap-2 text-gray-400 hover:text-white"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Campaigns
            </Button>

            {/* Campaign header */}
            {campaign && (
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{campaign.name}</h1>
                        <p className="text-gray-400 mt-1">Campaign ID: {campaign.id}</p>
                    </div>
                    <Badge 
                        className={`text-base px-4 py-2 ${getStatusColor(campaign.status)}`}
                    >
                        {campaign.status}
                    </Badge>
                </div>
            )}

            {/* Tab navigation */}
            <div className="border-b border-white/10">
                <div className="flex gap-4">
                    {steps.map(step => {
                        const isActive = pathname === step.href;
                        return (
                            <Link
                                key={step.href}
                                href={step.href}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    isActive
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {step.label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Tab content */}
            <div>{children}</div>
        </div>
    );
}
