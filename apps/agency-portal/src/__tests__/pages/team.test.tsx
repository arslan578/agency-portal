import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TeamPage from '@/app/(dashboard)/team/page';

const mockMembers = [
  { id: 1, user_id: 10, email: 'admin@test.com', full_name: 'Admin User', role: 'agency_admin' },
  { id: 2, user_id: 20, email: 'viewer@test.com', full_name: 'Viewer User', role: 'agency_viewer' },
];

const mockInvites = [
  { id: 100, email: 'pending@test.com', role: 'agency_viewer' },
];

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: { id: '10', agencyId: '1', agencyRole: 'agency_admin', agencyName: 'Agency', tier: 'free', accessToken: 'tok' },
      accessToken: 'tok',
    },
    status: 'authenticated',
  })),
}));

jest.mock('@/hooks/useAgencyApi', () => ({
  useMembers: jest.fn(() => ({
    members: mockMembers,
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  })),
  useInvites: jest.fn(() => ({
    invites: mockInvites,
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  })),
  useApiAuth: jest.fn(() => ({ accessToken: 'tok', agencyId: '1' })),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

describe('TeamPage', () => {
  it('renders team members', () => {
    render(<TeamPage />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Viewer User')).toBeInTheDocument();
  });

  it('shows member count badge', () => {
    render(<TeamPage />);
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('shows pending invites section', () => {
    render(<TeamPage />);
    expect(screen.getByText('Pending Invites')).toBeInTheDocument();
    expect(screen.getByText('pending@test.com')).toBeInTheDocument();
  });

  it('shows invite button for admin', () => {
    render(<TeamPage />);
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
  });

  it('opens invite dialog when clicking invite button', () => {
    render(<TeamPage />);
    fireEvent.click(screen.getByText('Invite Member'));
    expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('colleague@agency.com')).toBeInTheDocument();
  });

  it('shows empty state when no members', () => {
    const { useMembers } = require('@/hooks/useAgencyApi');
    useMembers.mockReturnValueOnce({ members: [], error: null, isLoading: false, refresh: jest.fn() });
    render(<TeamPage />);
    expect(screen.getByText('No team members')).toBeInTheDocument();
  });

  it('shows error state on load failure', () => {
    const hooks = require('@/hooks/useAgencyApi');
    hooks.useMembers.mockImplementation(() => ({ members: [], error: { message: 'Network fail' }, isLoading: false, refresh: jest.fn() }));
    render(<TeamPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Network fail')).toBeInTheDocument();
    hooks.useMembers.mockImplementation(() => ({ members: mockMembers, error: null, isLoading: false, refresh: jest.fn() }));
  });

  it('shows loading skeleton', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValueOnce({ data: null, status: 'loading' });
    const { container } = render(<TeamPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
