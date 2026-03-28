import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ReportingPage from '../page';
import * as SWR from 'swr';
import { apiClient } from '@/lib/api/client';

// Mock apiClient
jest.mock('@/lib/api/client', () => ({
    apiClient: {
        get: jest.fn(),
    }
}));

// Mock SWR
// We'll mock the hook implementation in specific tests, but provide a default here
jest.mock('swr', () => ({
    __esModule: true,
    default: jest.fn()
}));

// Polyfill ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock Recharts ResponsiveContainer to avoid dimension warnings in tests
jest.mock('recharts', () => {
    const OriginalModule = jest.requireActual('recharts');
    return {
        ...OriginalModule,
        ResponsiveContainer: ({ children, width = 400, height = 300 }: any) => (
            <div style={{ width, height }}>{children}</div>
        ),
    };
});

describe('ReportingPage Resilience', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders error banner and retry button when campaigns fetch fails', async () => {
        const mutateMock = jest.fn();
        // Mock SWR to return error for campaigns
        (SWR.default as jest.Mock).mockReturnValue({
            data: undefined,
            error: new Error('Service unavailable'),
            isLoading: false,
            mutate: mutateMock
        });

        render(<ReportingPage />);

        // Should show error banner
        expect(screen.getByText(/Reporting is temporarily unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument();

        // Verify Retry Button
        const retryBtn = screen.getByText('Retry Connection');
        expect(retryBtn).toBeInTheDocument();

        // Simluate Click
        retryBtn.click();
        expect(mutateMock).toHaveBeenCalled();
    });

    test('renders spinner when loading campaigns', async () => {
        (SWR.default as jest.Mock).mockReturnValue({
            data: undefined,
            error: undefined,
            isLoading: true
        });

        const { container } = render(<ReportingPage />);

        // Look for the skeleton container class
        // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
        const skeleton = container.querySelector('.space-y-6');
        expect(skeleton).toBeInTheDocument();
    });

    test('renders dashboard when campaigns loaded', async () => {
        // Mock SWR to return different data based on key
        (SWR.default as jest.Mock).mockImplementation((key: string) => {
            if (key === '/campaigns') {
                return {
                    data: [{ id: 1, name: 'Campaign 1' }],
                    error: undefined,
                    isLoading: false
                };
            }
            if (key && key.includes('/reports/campaign/')) {
                return {
                    data: [
                        { date: '2023-01-01', platform: 'facebook', impressions: 1000, clicks: 100, spend: 50.00, conversions: 5 }
                    ],
                    error: undefined,
                    isLoading: false
                };
            }
            return { data: undefined, error: undefined, isLoading: false };
        });

        render(<ReportingPage />);

        expect(screen.getByText('Campaign Reporting')).toBeInTheDocument();
        expect(screen.getByText('Campaign 1')).toBeInTheDocument();
        // Check for report data presence
        await waitFor(() => {
            const elements = screen.getAllByText('1,000');
            expect(elements.length).toBeGreaterThan(0);
        });
    });
});
