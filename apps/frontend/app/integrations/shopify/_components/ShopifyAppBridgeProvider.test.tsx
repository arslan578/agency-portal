import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
import { ShopifyAppBridgeProvider } from './ShopifyAppBridgeProvider';
import { useSearchParams } from 'next/navigation';
import { useShopifyHost } from './useShopifyHost';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('./useShopifyHost');
jest.mock('next/navigation', () => ({
    useSearchParams: jest.fn(),
}));

jest.mock('@shopify/app-bridge-react', () => ({
    Provider: ({ children, config }: any) => (
        <div data-testid="app-bridge-provider" data-config={JSON.stringify(config)}>
            {children}
        </div>
    ),
}));

// Mock Polaris components since we don't want to test them
jest.mock('@shopify/polaris', () => {
    const Layout = ({ children }: any) => <div>{children}</div>;
    Layout.Section = ({ children }: any) => <div>{children}</div>;
    return {
        Page: ({ children }: any) => <div>{children}</div>,
        Layout,
        Banner: ({ children, title }: any) => <div role="alert" title={title}>{children}</div>,
        Text: ({ children }: any) => <span>{children}</span>,
        Spinner: () => <div data-testid="polaris-spinner" />,
    };
});

describe('ShopifyAppBridgeProvider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = 'test_api_key';
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('renders children wrapped in Provider when valid host found', () => {
        (useShopifyHost as jest.Mock).mockReturnValue('YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==');

        render(
            <ShopifyAppBridgeProvider>
                <div data-testid="child">Child Content</div>
            </ShopifyAppBridgeProvider>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByTestId('app-bridge-provider')).toBeInTheDocument();

        const config = JSON.parse(screen.getByTestId('app-bridge-provider').getAttribute('data-config') || '{}');
        expect(config).toEqual(expect.objectContaining({
            apiKey: 'test_api_key',
            host: 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==',
            forceRedirect: true
        }));
    });

    it('renders config banner when API KEY is missing', () => {
        process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = ''; // Simulate missing env
        (useShopifyHost as jest.Mock).mockReturnValue('test.myshopify.com');

        render(
            <ShopifyAppBridgeProvider>
                <div>Child Content</div>
            </ShopifyAppBridgeProvider>
        );

        expect(screen.getByRole('alert')).toHaveAttribute('title', 'Configuration Error');
    });

    it('initially renders loading state when HOST is missing, then warning after timeout', async () => {
        jest.useFakeTimers();
        (useShopifyHost as jest.Mock).mockReturnValue(null);

        render(
            <ShopifyAppBridgeProvider>
                <div>Child Content</div>
            </ShopifyAppBridgeProvider>
        );

        // Initially loading (no alert yet)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        // Fast-forward time past the 750ms timeout
        act(() => {
            jest.advanceTimersByTime(800);
        });

        // Flush any pending updates
        act(() => {
            jest.runOnlyPendingTimers();
        });

        // Now warning appears
        await act(async () => {
            expect(screen.getByRole('alert')).toHaveAttribute('title', 'Missing Host Parameter');
        });

        jest.useRealTimers();
    });

    it('handles late arrival of host without crashing (Regression Test for #310)', () => {
        // Regression test for "Rendered more hooks than during the previous render"
        // Cycle: host=null -> render -> host=value -> rerender
        // This fails if useMemo is conditionally skipped.

        const BASE64_HOST = 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==';

        // Deterministic sequence: First render null, second render value
        (useShopifyHost as jest.Mock)
            .mockReturnValueOnce(null)
            .mockReturnValue(BASE64_HOST);

        const { rerender } = render(
            <ShopifyAppBridgeProvider>
                <div data-testid="child">Child Content</div>
            </ShopifyAppBridgeProvider>
        );

        // Initial render (host=null)
        // Should show loading spinner (or nothing) initially, no crash

        // Trigger re-render which will pick up the second mock value
        rerender(
            <ShopifyAppBridgeProvider>
                <div data-testid="child">Child Content</div>
            </ShopifyAppBridgeProvider>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        const config = JSON.parse(screen.getByTestId('app-bridge-provider').getAttribute('data-config') || '{}');
        expect(config.host).toBe(BASE64_HOST);
    });
});
