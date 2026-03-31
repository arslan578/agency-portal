'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { getPostSignupPath, getSignupPath, inferInviteJourney } from '@/lib/authFlow';

type InviteState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; code: 'used' | 'expired' | 'invalid' | 'unknown'; message: string };

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');
  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    if (!token) return;
    hasStarted.current = true;

    async function verify() {
      try {
        const result = await signIn('magic-link', {
          token,
          redirect: false,
        });

        if (result?.error) {
          setState({
            status: 'error',
            code: 'unknown',
            message: 'Verification failed. The link may be invalid or expired.',
          });
          return;
        }

        setState({ status: 'success' });
        const freshSession = await getSession();
        const accessToken = freshSession?.accessToken || freshSession?.user?.accessToken;
        const agencyId = freshSession?.user?.agencyId;
        const agencyRole = freshSession?.user?.agencyRole;
        
        // Determine if they are an admin or regular team member
        const journey = await inferInviteJourney({ accessToken, agencyId, agencyRole });

        if (freshSession?.user?.needsPassword) {
          // New users must set a password first
          window.location.replace(getSignupPath(journey));
          return;
        }

        // Existing users can go straight to their destination (Dashboard for team, Onboarding for new admins)
        window.location.replace(getPostSignupPath(journey));
      } catch {
        setState({
          status: 'error',
          code: 'unknown',
          message: 'An unexpected error occurred during verification.',
        });
      }
    }

    verify();
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-[420px] text-center space-y-5">
          <div className="flex items-center justify-center gap-2 mb-10">
            <svg width="26" height="26" viewBox="0 0 239 239" fill="none" aria-hidden>
              <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.13 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.7 68.17 26.78 C83.56 16.94 97.7 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
            </svg>
            <span className="text-teal-deep text-[28px] font-extrabold tracking-[0.18em] leading-none">KAIVO</span>
          </div>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-text-primary">Invitation failed</h1>
          <p className="text-[14px] text-text-muted font-medium leading-relaxed">
            No invitation token was found in the URL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white p-8">
      <div className="w-full max-w-[420px] text-center">
        <div className="flex items-center justify-center gap-2 mb-10">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none" aria-hidden>
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.13 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.7 68.17 26.78 C83.56 16.94 97.7 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
          </svg>
          <span className="text-teal-deep text-[28px] font-extrabold tracking-[0.18em] leading-none">KAIVO</span>
        </div>

        {state.status === 'loading' && (
          <div className="space-y-4">
            <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
            <h1 className="text-[22px] font-bold text-text-primary">Accepting your invite...</h1>
            <p className="text-[14px] text-text-muted font-medium">Please wait while we set up your access.</p>
          </div>
        )}

        {state.status === 'success' && (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#007B5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-[22px] font-bold text-text-primary">Welcome to the team!</h1>
            <p className="text-[14px] text-text-muted font-medium">Redirecting you now...</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="text-[22px] font-bold text-text-primary">Invite error</h1>
            <p className="text-[14px] text-text-muted font-medium leading-relaxed">
              {state.message}
            </p>
            <div className="pt-2">
              <p className="text-[13px] text-text-muted">
                Need help?{' '}
                <a href="mailto:support@getkaivo.com" className="text-teal-deep font-semibold hover:text-teal-deep/80 no-underline">
                  Contact support
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
