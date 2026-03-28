import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSidebar } from './AppSidebar';
import '@testing-library/jest-dom';

// Mock Dependencies
jest.mock('next/navigation', () => ({
    usePathname: () => '/dashboard',
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    default: (props: any) => <img {...props} alt={props.alt || ""} />,
}));

// Mock Contexts
const mockUser = {
    id: 1,
    email: 'test@example.com',
    is_active: true,
    is_admin: false,
    tier: 'TIER_4',
    agency_id: null, // Default no agency
};

const mockCapabilities = {
    features: {
        FF_OS_RUNTIME_ENABLED: true, // Feature enabled
    }
};

jest.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
    }),
}));

jest.mock('@/context/CapabilitiesContext', () => ({
    useCapabilities: () => ({
        capabilities: mockCapabilities,
    }),
}));

describe('AppSidebar', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders core navigation items', () => {
        render(<AppSidebar />);
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Campaigns')).toBeInTheDocument();
    });

    it('hides agency section when user has no agency_id', () => {
        render(<AppSidebar />);
        // Agency group is hidden entirely when user has no agency_id (group.requiresAgency)
        expect(screen.queryByText('Overview')).not.toBeInTheDocument();
        expect(screen.queryByText('Clients')).not.toBeInTheDocument();
    });

    it('shows agency section when user has agency_id', () => {
        // Override mock for this test
        const userWithAgency = { ...mockUser, agency_id: 'agency_123' };
        jest.spyOn(require('@/context/AuthContext'), 'useAuth').mockImplementation(() => ({
            user: userWithAgency
        }));

        render(<AppSidebar />);
        expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    it('hides feature-gated items if feature is disabled', () => {
        // Disable feature by overriding the mock
        const capsDisabled = { features: { FF_OS_RUNTIME_ENABLED: false } };
        const useCapabilitiesMock = jest.fn(() => ({
            capabilities: capsDisabled
        }));
        
        // Override the mock for this test
        jest.spyOn(require('@/context/CapabilitiesContext'), 'useCapabilities')
            .mockImplementation(useCapabilitiesMock);

        render(<AppSidebar />);
        expect(screen.queryByText('Intelligence')).not.toBeInTheDocument();
    });

    it('shows feature-gated items if feature is enabled', () => {
        // Enable feature (default mock)
        render(<AppSidebar />);
        // It should be visible now
        expect(screen.getByText('Intelligence')).toBeInTheDocument();
    });
});
