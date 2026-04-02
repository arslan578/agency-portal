'use client';

import { useEffect } from 'react';

/**
 * Microsoft redirects here; we forward to the integrations page with a stable query flag
 * so the dashboard route can POST /agency/{id}/microsoft/connect with the auth session.
 */
export default function MicrosoftOauthCallbackPage() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    params.set('microsoft_callback', '1');

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (code) params.set('code', code);
    if (state) params.set('state', state);
    if (error) params.set('error', error);
    if (errorDescription) params.set('error_description', errorDescription);

    window.location.replace(`/integrations?${params.toString()}`);
  }, []);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">
      Processing Microsoft authorization…
    </div>
  );
}
