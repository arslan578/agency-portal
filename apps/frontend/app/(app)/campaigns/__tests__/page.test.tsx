import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CampaignsPage from '../page';
import { apiClient } from '@/lib/api/client';

// Mock apiClient
jest.mock('@/lib/api/client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    }
}));

// Mock useRouter
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

// Mock Translation
jest.mock('@/context/LanguageContext', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CampaignsPage Resilience', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders empty state safely when API returns non-array (object)', async () => {
        // Simulate API returning valid JSON but wrong shape (e.g. from a proxy error treated as success by client, or just bad data)
        // With our new protections, client shouldn't see this for proxy errors (client throws), but if it DOES return object:
        (apiClient.get as jest.Mock).mockResolvedValue({ some: 'object' });

        render(<CampaignsPage />);

        // It should not crash.
        // It should eventually show "No campaigns found" or similar empty state.

        // Wait for loading to finish
        await waitFor(() => {
            const emptyMessages = screen.getAllByText(/No campaigns found/i);
            expect(emptyMessages.length).toBeGreaterThan(0);
        });

        // And verify no error banner since we handled it safely via asArray (unless we explicitly threw)
        // Actually, asArray({ object }) -> [], so it treats it as empty list success.
        const errorBanner = screen.queryByText(/Failed to load campaigns/i);
        expect(errorBanner).not.toBeInTheDocument();
    });

    test('renders error banner when API throws', async () => {
        (apiClient.get as jest.Mock).mockRejectedValue(new Error('Service Unavailable'));

        render(<CampaignsPage />);

        await waitFor(() => {
            const errorTitle = screen.getByText(/Failed to load campaigns/i);
            const errorDetails = screen.getByText(/Service Unavailable/i);
            expect(errorTitle).toBeInTheDocument();
            expect(errorDetails).toBeInTheDocument();
        });

        // Should also show empty table state or at least not crash
        // campaigns state is []
    });
});
