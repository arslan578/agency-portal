import { Suspense } from 'react';
import { CampaignsContent } from '../_components/CampaignsContent';
import { LoadingSpinner } from '../_components/LoadingSpinner';

export default function CampaignsPage() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <CampaignsContent />
        </Suspense>
    );
}
