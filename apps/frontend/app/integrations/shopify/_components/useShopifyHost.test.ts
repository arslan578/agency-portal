import { renderHook, act } from '@testing-library/react';
import { useShopifyHost } from './useShopifyHost';
import { useSearchParams } from 'next/navigation';

// Mock dependencies
jest.mock('next/navigation', () => ({
    useSearchParams: jest.fn(),
}));

describe('useShopifyHost', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.sessionStorage.clear();
    });

    it('returns host from URL if present and saves to storage', () => {
        (useSearchParams as jest.Mock).mockReturnValue({
            get: (key: string) => (key === 'host' ? 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==' : null),
        });

        const { result } = renderHook(() => useShopifyHost());

        expect(result.current).toBe('YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==');
        expect(window.sessionStorage.getItem('SHOPIFY_HOST')).toBe('YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==');
    });

    it('returns host from storage if URL param is missing', () => {
        window.sessionStorage.setItem('SHOPIFY_HOST', 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==');
        (useSearchParams as jest.Mock).mockReturnValue({
            get: (_key: string) => null,
        });

        const { result } = renderHook(() => useShopifyHost());

        expect(result.current).toBe('YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUva2Fpdm8tMw==');
    });

    it('returns null if neither URL nor storage has host', () => {
        (useSearchParams as jest.Mock).mockReturnValue({
            get: (_key: string) => null,
        });

        const { result } = renderHook(() => useShopifyHost());

        expect(result.current).toBeNull();
    });
});
