import { getPostSignupPath, getSignupPath, inferInviteJourney } from '@/lib/authFlow';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockedGet = apiClient.get as jest.Mock;

describe('authFlow', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('returns team for non-admin users', async () => {
    await expect(
      inferInviteJourney({
        accessToken: 'token',
        agencyId: '1',
        agencyRole: 'agency_viewer',
      }),
    ).resolves.toBe('team');
  });

  it('returns agency for the first admin user in an agency', async () => {
    mockedGet
      .mockResolvedValueOnce([{ id: 1, user_id: 1, email: 'owner@getkaivo.com', role: 'agency_admin' }])
      .mockResolvedValueOnce({
        agency: { id: 1, name: 'Agency' },
        clients_count: 0,
        campaigns_count: 0,
        active_campaigns_count: 0,
      });

    await expect(
      inferInviteJourney({
        accessToken: 'token',
        agencyId: '1',
        agencyRole: 'agency_admin',
      }),
    ).resolves.toBe('agency');
  });

  it('returns team when the agency already has members and live data', async () => {
    mockedGet
      .mockResolvedValueOnce([
        { id: 1, user_id: 1, email: 'owner@getkaivo.com', role: 'agency_admin' },
        { id: 2, user_id: 2, email: 'user@getkaivo.com', role: 'agency_viewer' },
      ])
      .mockResolvedValueOnce({
        agency: { id: 1, name: 'Agency' },
        clients_count: 3,
        campaigns_count: 9,
        active_campaigns_count: 5,
      });

    await expect(
      inferInviteJourney({
        accessToken: 'token',
        agencyId: '1',
        agencyRole: 'agency_admin',
      }),
    ).resolves.toBe('team');
  });

  it('builds signup and post-signup paths', () => {
    expect(getSignupPath('agency')).toBe('/signup?journey=agency');
    expect(getPostSignupPath('agency')).toBe('/onboarding');
    expect(getPostSignupPath('team')).toBe('/');
  });
});
