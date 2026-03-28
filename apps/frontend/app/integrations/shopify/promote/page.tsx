import { Suspense } from 'react';
import { PromoteContent } from '../_components/PromoteContent';
import { LoadingSpinner } from '../_components/LoadingSpinner';

export default function PromotePage() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <PromoteContent />
        </Suspense>
    );
}
