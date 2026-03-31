import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { DashboardData, TeamMember } from '@/lib/api/contracts';

export type InviteJourney = 'agency' | 'team';

interface InviteJourneyContext {
  accessToken?: string;
  agencyId?: string | null;
  agencyRole?: string | null;
}

export async function inferInviteJourney({
  accessToken,
  agencyId,
  agencyRole,
}: InviteJourneyContext): Promise<InviteJourney> {
  if (!accessToken || !agencyId || agencyRole !== 'agency_admin') {
    return 'team';
  }

  try {
    const [membersResult, dashboardResult] = await Promise.allSettled([
      apiClient.get<TeamMember[]>(
        API_ENDPOINTS.AGENCY.MEMBERS(agencyId),
        { accessToken, agencyId },
      ),
      apiClient.get<DashboardData>(
        API_ENDPOINTS.AGENCY.DASHBOARD(agencyId),
        { accessToken, agencyId },
      ),
    ]);

    if (membersResult.status === 'fulfilled' && membersResult.value.length <= 1) {
      return 'agency';
    }

    if (
      dashboardResult.status === 'fulfilled' &&
      dashboardResult.value.clients_count === 0 &&
      dashboardResult.value.campaigns_count === 0
    ) {
      return 'agency';
    }
  } catch {
    return 'team';
  }

  return 'team';
}

export function getSignupPath(journey: InviteJourney) {
  return `/signup?journey=${journey}`;
}

export function getPostSignupPath(journey: InviteJourney) {
  return journey === 'agency' ? '/onboarding' : '/';
}
