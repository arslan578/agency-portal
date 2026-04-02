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
      let message = res.statusText;
      if (typeof data === 'object' && data?.detail) {
        if (Array.isArray(data.detail)) {
          // Format 422 Unprocessable Content errors (FastAPI validation)
          message = data.detail.map((d: any) => `${d.loc.join('.')}: ${d.msg}`).join('; ');
        } else {
          message = data.detail;
        }
      }
      const err: ApiError = {
        status: res.status,
        message: String(message),
        details: data,
      };
      throw err;
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeout);
    // Normalize already-constructed ApiError
    if (err.status != null) {
      // It's already an ApiError
      Object.defineProperty(err, 'name', { value: 'ApiError' });
      Object.defineProperty(err, 'stack', { value: new Error().stack });
      throw err;
    }
    // Gracefully handle aborted/timeout fetches so they don't surface as noisy console errors
    const msg = String(err?.message ?? '');
    const name = String(err?.name ?? '');
    if (name === 'AbortError' || msg.toLowerCase().includes('aborted')) {
      const e: ApiError = {
        status: 0,
        message: 'Request aborted',
        details: err,
      };
      Object.defineProperty(e, 'name', { value: 'ApiError' });
      throw e;
    }

    const e = new Error(msg || 'Network error') as Error & ApiError;
    e.status = 0;
    e.message = msg || 'Network error';
    throw e;
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
