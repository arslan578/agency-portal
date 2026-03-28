import React from 'react';
import { render, screen } from '@testing-library/react';
import { WorkspaceSwitcher } from '@/components/agency/WorkspaceSwitcher';

const mockSession = {
  data: {
    user: {
      id: '1',
      name: 'Test User',
      email: 'test@test.com',
      agencyId: '10',
      agencyRole: 'agency_admin',
      agencyName: 'Test Agency',
      tier: 'pro',
      accessToken: 'token',
    },
    accessToken: 'token',
  },
  status: 'authenticated' as const,
  update: jest.fn(),
};

const mockNoAgencySession = {
  data: {
    user: { id: '1', name: 'Test', email: 'test@test.com', agencyId: null, agencyRole: null, agencyName: null, tier: 'free', accessToken: 'token' },
    accessToken: 'token',
  },
  status: 'authenticated' as const,
  update: jest.fn(),
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => mockSession),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/hooks/useAgencyApi', () => ({
  useDashboard: jest.fn(() => ({
    data: {
      agency: { id: 10, name: 'Test Agency', current_plan: 'pro', credits: 100, billing_status: 'active' },
      clients_count: 5,
      campaigns_count: 3,
      active_campaigns_count: 1,
    },
    isLoading: false,
    error: null,
  })),
}));

describe('WorkspaceSwitcher', () => {
  it('renders agency name and plan', () => {
    render(<WorkspaceSwitcher />);
    expect(screen.getByText('Test Agency')).toBeInTheDocument();
    expect(screen.getByText('pro plan')).toBeInTheDocument();
  });

  it('renders nothing when user has no agency', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValueOnce(mockNoAgencySession);
    const { container } = render(<WorkspaceSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state when data is loading', () => {
    const { useDashboard } = require('@/hooks/useAgencyApi');
    useDashboard.mockReturnValueOnce({ data: null, isLoading: true, error: null });
    render(<WorkspaceSwitcher />);
    expect(screen.getByText('Test Agency')).toBeInTheDocument();
  });
});
