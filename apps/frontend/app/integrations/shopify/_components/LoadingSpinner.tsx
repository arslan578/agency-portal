'use client';
import { Spinner } from '@shopify/polaris';

export const LoadingSpinner = () => (
    <div className="flex justify-center p-8">
        <Spinner size="large" accessibilityLabel="Loading" />
    </div>
);
