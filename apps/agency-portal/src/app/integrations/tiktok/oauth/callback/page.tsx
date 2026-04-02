'use client';

import { useEffect } from 'react';

export default function TiktokOauthCallbackPage() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    params.set('tiktok_callback', '1');

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (code) params.set('code', code);
    if (state) params.set('state', state);
    if (error) params.set('error', error);
    if (errorDescription) params.set('error_description', errorDescription);

    const returnBase =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('kaivo_oauth_return_base') || '/integrations'
        : '/integrations';
    if (typeof window !== 'undefined') sessionStorage.removeItem('kaivo_oauth_return_base');

    // Hard navigation to avoid app-router transition issues on OAuth callback.
    window.location.replace(`${returnBase}?${params.toString()}`);
  }, []);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">
      Processing TikTok authorization...
    </div>
  );
}

