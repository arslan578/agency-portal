'use client';

import { useEffect } from 'react';

/**
 * Google OAuth redirects here; forward to the integrations page with a stable query flag
 * so the session can POST /agency/{id}/google/connect with the auth code.
 */
export default function GoogleAdsOauthCallbackPage() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    params.set('google_callback', '1');

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
      Processing Google authorization…
    </div>
  );
}
