import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientSwitcher } from '@/components/agency/ClientSwitcher';

const mockClients = [
  { id: 1, agency_id: 10, name: 'Client Alpha', is_active: true },
  { id: 2, agency_id: 10, name: 'Client Beta', is_active: true },
  { id: 3, agency_id: 10, name: 'Client Gamma', is_active: false },
];

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: { id: '1', agencyId: '10', agencyName: 'Agency', agencyRole: 'agency_admin', tier: 'free', accessToken: 'tok' },
      accessToken: 'tok',
    },
    status: 'authenticated',
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/hooks/useAgencyApi', () => ({
  useClients: jest.fn(() => ({
    clients: mockClients,
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  })),
}));

describe('ClientSwitcher', () => {
  it('shows the first client as selected by default', () => {
    render(<ClientSwitcher />);
    expect(screen.getByText('Client Alpha')).toBeInTheDocument();
  });

  it('opens dropdown on click and shows all clients', () => {
    render(<ClientSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Client Beta')).toBeInTheDocument();
    expect(screen.getByText('Client Gamma')).toBeInTheDocument();
  });

  it('shows error state when clients fail to load', () => {
    const hooks = require('@/hooks/useAgencyApi');
    hooks.useClients.mockImplementation(() => ({ clients: [], error: { message: 'Network error' }, isLoading: false, refresh: jest.fn() }));
    render(<ClientSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Failed to load clients')).toBeInTheDocument();
    hooks.useClients.mockImplementation(() => ({ clients: mockClients, error: null, isLoading: false, refresh: jest.fn() }));
  });

  it('shows empty state when no clients exist', () => {
    const hooks = require('@/hooks/useAgencyApi');
    hooks.useClients.mockImplementation(() => ({ clients: [], error: null, isLoading: false, refresh: jest.fn() }));
    render(<ClientSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No clients yet')).toBeInTheDocument();
    hooks.useClients.mockImplementation(() => ({ clients: mockClients, error: null, isLoading: false, refresh: jest.fn() }));
  });
});
