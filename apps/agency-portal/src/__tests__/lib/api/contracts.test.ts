import {
  AgencySchema,
  ClientSchema,
  TeamMemberSchema,
  InviteSchema,
  DashboardSchema,
  validateResponse,
  validateArray,
  AGENCY_ROLES,
  ROLE_PERMISSIONS,
} from '@/lib/api/contracts';

describe('Contract Schemas', () => {
  describe('AgencySchema', () => {
    it('parses a valid agency', () => {
      const data = { id: 1, name: 'Test Agency', current_plan: 'pro', credits: 100, billing_status: 'active' };
      const result = AgencySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('applies defaults for missing optional fields', () => {
      const data = { id: 2, name: 'Min Agency' };
      const result = AgencySchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current_plan).toBe('free');
        expect(result.data.credits).toBe(0);
      }
    });

    it('rejects missing required fields', () => {
      const result = AgencySchema.safeParse({ id: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('ClientSchema', () => {
    it('parses a valid client', () => {
      const data = { id: 1, agency_id: 1, name: 'Client A', is_active: true };
      expect(ClientSchema.safeParse(data).success).toBe(true);
    });

    it('handles nullable industry/website', () => {
      const data = { id: 1, agency_id: 1, name: 'Client B', industry: null, website: null };
      const result = ClientSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('TeamMemberSchema', () => {
    it('parses valid member data', () => {
      const data = { id: 1, user_id: 10, email: 'test@test.com', role: 'agency_admin' };
      expect(TeamMemberSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('InviteSchema', () => {
    it('parses valid invite', () => {
      const data = { id: 1, email: 'invite@test.com', role: 'agency_viewer' };
      expect(InviteSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('DashboardSchema', () => {
    it('parses full dashboard response', () => {
      const data = {
        agency: { id: 1, name: 'Agency', current_plan: 'free', credits: 50, billing_status: 'active' },
        clients_count: 5,
        campaigns_count: 10,
        active_campaigns_count: 3,
      };
      expect(DashboardSchema.safeParse(data).success).toBe(true);
    });

    it('rejects malformed agency object', () => {
      const data = { agency: { id: 'not-a-number' }, clients_count: 0 };
      expect(DashboardSchema.safeParse(data).success).toBe(false);
    });
  });
});

describe('validateResponse', () => {
  it('returns ok:true for valid data', () => {
    const result = validateResponse(AgencySchema, { id: 1, name: 'Test' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe('Test');
  });

  it('returns ok:false for invalid data', () => {
    const result = validateResponse(AgencySchema, { id: 'bad' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Contract violation');
  });
});

describe('validateArray', () => {
  it('validates an array of items', () => {
    const items = [
      { id: 1, agency_id: 1, name: 'A' },
      { id: 2, agency_id: 1, name: 'B' },
    ];
    const result = validateArray(ClientSchema, items);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(2);
  });

  it('returns error for non-array input', () => {
    const result = validateArray(ClientSchema, { not: 'an-array' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Expected array');
  });

  it('returns error for invalid items in array', () => {
    const result = validateArray(ClientSchema, [{ bad: true }]);
    expect(result.ok).toBe(false);
  });
});

describe('AGENCY_ROLES', () => {
  it('defines 3 roles', () => {
    expect(Object.keys(AGENCY_ROLES)).toHaveLength(3);
    expect(AGENCY_ROLES.agency_admin.label).toBe('Admin');
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('admin has the most capabilities', () => {
    expect(ROLE_PERMISSIONS.agency_admin.capabilities.length).toBeGreaterThan(ROLE_PERMISSIONS.agency_viewer.capabilities.length);
  });

  it('every role has sections', () => {
    for (const role of Object.values(ROLE_PERMISSIONS)) {
      expect(role.sections.length).toBeGreaterThan(0);
    }
  });
});
