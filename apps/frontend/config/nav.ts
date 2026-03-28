import {
    LayoutDashboard,
    Megaphone,
    Users,
    Upload,
    Briefcase,
    Settings,
    FileText,
    Brain,
    Palette,
    CreditCard,
    Building2,
    Users2,
    BarChart3
} from 'lucide-react';

export interface NavItem {
    label: string;
    href: string;
    icon: any;
    requiresFeature?: string; // Key from capabilities.features
    requiresAgency?: boolean; // If true, only show if user has agency_id
}

export interface NavGroup {
    id: string;
    label?: string; // Optional header
    items: NavItem[];
    requiresAgency?: boolean; // If true, hide entire group when user has no agency_id
}

export const SIDEBAR_CONFIG: NavGroup[] = [
    {
        id: 'core',
        items: [
            {
                label: 'Dashboard',
                href: '/dashboard',
                icon: LayoutDashboard
            },
            {
                label: 'Campaigns',
                href: '/campaigns',
                icon: Megaphone
            },
            {
                label: 'Audiences',
                href: '/audiences',
                icon: Users
            },
            {
                label: 'Upload Audience',
                href: '/audiences/upload',
                icon: Upload
            },
            {
                label: 'Reporting',
                href: '/reporting',
                icon: BarChart3
            },
            {
                label: 'Intelligence',
                href: '/intelligence',
                icon: Brain,
                requiresFeature: 'FF_OS_RUNTIME_ENABLED'
            }
        ]
    },
    {
        id: 'build',
        label: 'Build & Optimize',
        items: [
            {
                label: 'Campaign Builder',
                href: '/plans/new',
                icon: FileText
            },
            {
                label: 'Create Ad Copy',
                href: '/creative',
                icon: Palette
            }
        ]
    },
    {
        id: 'agency',
        label: 'Agency',
        requiresAgency: true,
        items: [
            {
                label: 'Overview',
                href: '/agency/dashboard',
                icon: Building2,
                requiresAgency: true
            },
            {
                label: 'Clients',
                href: '/agency/clients',
                icon: Users2,
                requiresAgency: true
            },
            {
                label: 'Team & Settings',
                href: '/agency/settings',
                icon: Settings,
                requiresAgency: true
            }
        ]
    },
    {
        id: 'account',
        label: 'Account',
        items: [
            {
                label: 'Billing',
                href: '/billing',
                icon: CreditCard
            },
            {
                label: 'Settings',
                href: '/settings', // Assuming route exists or will exist
                icon: Settings
            }
        ]
    }
];
