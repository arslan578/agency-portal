'use client';

import { useAgency } from '@/context/AgencyContext';
import { ReactNode } from 'react';

type AgencyRoleType = 'agency_admin' | 'agency_member' | 'agency_viewer';

type Props = {
    allowedRoles: AgencyRoleType[];
    children: ReactNode;
    fallback?: ReactNode;
};

export function RoleGuard({ allowedRoles, children, fallback = null }: Props) {
    const { role } = useAgency();
    
    if (!role || !allowedRoles.includes(role as AgencyRoleType)) {
        return <>{fallback}</>;
    }
    
    return <>{children}</>;
}

export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
    return (
        <RoleGuard allowedRoles={['agency_admin']} fallback={fallback}>
            {children}
        </RoleGuard>
    );
}

export function MemberOrAbove({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
    return (
        <RoleGuard allowedRoles={['agency_admin', 'agency_member']} fallback={fallback}>
            {children}
        </RoleGuard>
    );
}
