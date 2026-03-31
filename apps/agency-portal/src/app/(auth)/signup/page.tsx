'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { getPostSignupPath, inferInviteJourney, type InviteJourney } from '@/lib/authFlow';

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [fullName, setFullName] = useState(session?.user?.name ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const journeyParam = searchParams?.get('journey');
  const journey = useMemo<InviteJourney | null>(() => {
    return journeyParam === 'agency' || journeyParam === 'team' ? journeyParam : null;
  }, [journeyParam]);

  useEffect(() => {
    if (session?.user?.name && !fullName) {
      setFullName(session.user.name);
    }
  }, [fullName, session?.user?.name]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const accessToken = session?.accessToken || session?.user?.accessToken;
    const agencyId = session?.user?.agencyId;

    if (!accessToken) {
      setError('Your session is missing. Please reopen your magic link and try again.');
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.patch(
        API_ENDPOINTS.AUTH.PROFILE,
        { full_name: fullName.trim() },
        { accessToken, agencyId },
      );

      await apiClient.post(
        API_ENDPOINTS.AUTH.SET_PASSWORD,
        { password, confirm_password: confirmPassword },
        { accessToken, agencyId },
      );

      const resolvedJourney = journey ?? await inferInviteJourney({
        accessToken,
        agencyId,
        agencyRole: session?.user?.agencyRole,
      });

      router.replace(getPostSignupPath(resolvedJourney));
    } catch (err) {
      const message = (err as { message?: string })?.message;
      setError(message || 'We could not finish setting up your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex bg-gradient-to-br from-dark-bg via-dark-card to-teal-deep flex-col p-12 relative overflow-hidden">
        <div className="absolute -bottom-[60px] -right-[60px] w-[320px] h-[320px] rounded-full bg-white/[0.06]" />
        <div className="absolute -top-[40px] right-[80px] w-[180px] h-[180px] rounded-full bg-white/[0.04]" />

        <div className="relative z-10 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none" aria-hidden>
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.13 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.7 68.17 26.78 C83.56 16.94 97.7 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
          </svg>
          <span className="text-white text-[28px] font-extrabold tracking-[0.18em] leading-none">KAIVO</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-[36px] font-bold text-white leading-[1.2] tracking-[-0.5px] mb-4">
            Finish creating your account
          </h2>
          <p className="text-[15px] text-white/75 font-medium leading-[1.6] max-w-[380px]">
            Set your details once, then continue into the agency portal. Agency owners will continue into onboarding after signup.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-12 bg-white">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[26px] font-bold text-text-primary mb-[6px]">Create your Kaivo account</h1>
          <p className="text-[13px] text-text-muted font-medium mb-8">
            You&apos;re joining as <strong>{session?.user?.email}</strong>. Add your name and password to continue.
          </p>

          {error && (
            <div className="bg-red-light border-[1.5px] border-[#FECDD3] rounded-lg px-[14px] py-[10px] text-[12.5px] font-semibold text-red mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-[6px] mb-4">
              <label className="text-[11px] font-semibold text-text-secondary tracking-wide">Full Name</label>
              <input
                type="text"
                required
                placeholder="Jane Smith"
                autoComplete="name"
                className="py-[11px] px-[14px] border border-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal-deep transition-colors"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setError('');
                }}
              />
            </div>

            <div className="flex flex-col gap-[6px] mb-4">
              <label className="text-[11px] font-semibold text-text-secondary tracking-wide">Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="py-[11px] px-[14px] border border-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal-deep transition-colors"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
              />
            </div>

            <div className="flex flex-col gap-[6px] mb-6">
              <label className="text-[11px] font-semibold text-text-secondary tracking-wide">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                className="py-[11px] px-[14px] border border-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal-deep transition-colors"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-[13px] bg-teal-deep hover:bg-teal-deep/90 text-white font-extrabold text-[14px] rounded-[10px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}
