import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PermissionsPage from '@/app/(dashboard)/permissions/page';

const mockMembers = [
  { id: 1, user_id: 10, email: 'admin@test.com', full_name: 'Admin User', role: 'agency_admin' },
  { id: 2, user_id: 20, email: 'mgr@test.com', full_name: 'Manager User', role: 'agency_manager' },
  { id: 3, user_id: 30, email: 'viewer@test.com', full_name: 'Viewer User', role: 'agency_viewer' },
];

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: { id: '1', agencyId: '1', agencyRole: 'agency_admin', tier: 'free', accessToken: 'tok' },
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
}));

describe('PermissionsPage', () => {
  it('renders role overview cards by default', () => {
    render(<PermissionsPage />);
    expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Manager').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to permission matrix tab', () => {
    render(<PermissionsPage />);
    fireEvent.click(screen.getByText('Permission Matrix'));
    expect(screen.getByText('Section')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('switches to members by role tab', () => {
    render(<PermissionsPage />);
    fireEvent.click(screen.getByText('Members by Role'));
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Manager User')).toBeInTheDocument();
    expect(screen.getByText('Viewer User')).toBeInTheDocument();
  });

  it('shows member count per role', () => {
    render(<PermissionsPage />);
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows error state on load failure', () => {
    const hooks = require('@/hooks/useAgencyApi');
    hooks.useMembers.mockImplementation(() => ({ members: [], error: { message: 'Load failed' }, isLoading: false, refresh: jest.fn() }));
    render(<PermissionsPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    hooks.useMembers.mockImplementation(() => ({ members: mockMembers, error: null, isLoading: false, refresh: jest.fn() }));
  });

  it('shows loading skeleton', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValueOnce({ data: null, status: 'loading' });
    const { container } = render(<PermissionsPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
