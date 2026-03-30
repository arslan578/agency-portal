'use client';

import { useEffect } from 'react';

export default function RedditOauthCallbackPage() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    params.set('reddit_callback', '1');

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (code) params.set('code', code);
    if (state) params.set('state', state);
    if (error) params.set('error', error);
    if (errorDescription) params.set('error_description', errorDescription);

    // Use hard navigation here to avoid app-router transition stalls on OAuth callback.
    window.location.replace(`/integrations?${params.toString()}`);
  }, []);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">
      Processing Reddit authorization...
    </div>
  );
}
