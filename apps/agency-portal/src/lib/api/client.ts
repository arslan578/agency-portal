/**
 * Authenticated API client for the Agency Portal.
 * Uses the NextAuth session accessToken + X-Agency-ID header.
 */

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

async function request<T>(
  url: string,
  options: RequestInit & { accessToken?: string; agencyId?: string | null } = {}
): Promise<T> {
  const { accessToken, agencyId, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (agencyId) headers['X-Agency-ID'] = agencyId;

  // If body is FormData, remove Content-Type
  if (fetchOpts.body instanceof FormData) delete headers['Content-Type'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 204) return {} as T;

    const contentType = res.headers.get('content-type');
    const data = contentType?.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const err: ApiError = {
        status: res.status,
        message: typeof data === 'object' && data?.detail ? data.detail : res.statusText,
        details: data,
      };
      throw err;
    }

    return data as T;
  } catch (err) {
    clearTimeout(timeout);
    if ((err as ApiError).status) throw err;
    throw { status: 0, message: err instanceof Error ? err.message : 'Network error' } as ApiError;
  }
}

export const apiClient = {
  get: <T>(url: string, opts?: { accessToken?: string; agencyId?: string | null }) =>
    request<T>(url, { method: 'GET', ...opts }),

  post: <T>(url: string, body: unknown, opts?: { accessToken?: string; agencyId?: string | null }) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body), ...opts }),

  patch: <T>(url: string, body: unknown, opts?: { accessToken?: string; agencyId?: string | null }) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  delete: <T>(url: string, opts?: { accessToken?: string; agencyId?: string | null }) =>
    request<T>(url, { method: 'DELETE', ...opts }),
};
