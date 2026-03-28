import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ClientsPage from '@/app/(dashboard)/clients/page';

const mockClients = [
  { id: 1, agency_id: 10, name: 'Acme Corp', industry: 'Tech', website: 'https://acme.com', is_active: true },
  { id: 2, agency_id: 10, name: 'Beta Inc', industry: 'Finance', is_active: true },
  { id: 3, agency_id: 10, name: 'Gamma LLC', industry: null, is_active: false },
];

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/clients'),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: { id: '1', agencyId: '10', agencyRole: 'agency_admin', tier: 'free', accessToken: 'tok' },
      accessToken: 'tok',
    },
    status: 'authenticated',
  })),
}));

jest.mock('@/hooks/useAgencyApi', () => ({
  useClients: jest.fn(() => ({
    clients: mockClients,
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  })),
  useApiAuth: jest.fn(() => ({ accessToken: 'tok', agencyId: '10' })),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

describe('ClientsPage', () => {
  it('renders client list', () => {
    render(<ClientsPage />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    expect(screen.getByText('Gamma LLC')).toBeInTheDocument();
  });

  it('shows total client count', () => {
    render(<ClientsPage />);
    expect(screen.getByText('3 total')).toBeInTheDocument();
  });

  it('filters clients by search', () => {
    render(<ClientsPage />);
    const input = screen.getByPlaceholderText('Search clients by name or industry...');
    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
  });

  it('shows inactive badge for inactive clients', () => {
    render(<ClientsPage />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('opens create dialog', () => {
    render(<ClientsPage />);
    fireEvent.click(screen.getByRole('button', { name: /add client/i }));
    expect(screen.getByText('Client Name *')).toBeInTheDocument();
  });

  it('shows empty state when no clients', () => {
    const { useClients } = require('@/hooks/useAgencyApi');
    useClients.mockReturnValueOnce({ clients: [], error: null, isLoading: false, refresh: jest.fn() });
    render(<ClientsPage />);
    expect(screen.getByText('No clients yet')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    const hooks = require('@/hooks/useAgencyApi');
    hooks.useClients.mockImplementation(() => ({ clients: [], error: { message: 'Server error' }, isLoading: false, refresh: jest.fn() }));
    render(<ClientsPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    hooks.useClients.mockImplementation(() => ({ clients: mockClients, error: null, isLoading: false, refresh: jest.fn() }));
  });

  it('shows loading skeleton', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValueOnce({ data: null, status: 'loading' });
    const { container } = render(<ClientsPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
