import { Suspense } from 'react';
import { SettingsContent } from '../_components/SettingsContent';
import { LoadingSpinner } from '../_components/LoadingSpinner';

export default function SettingsPage() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <SettingsContent />
        </Suspense>
    );
}
