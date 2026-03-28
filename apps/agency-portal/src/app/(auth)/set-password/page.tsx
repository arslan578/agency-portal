'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com';

function SetPasswordContent() {
  const { data: session, status } = useSession();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      setWaitingForSession(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (status === 'unauthenticated') {
      timerRef.current = setTimeout(() => {
        setWaitingForSession(false);
      }, 3000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status]);

  if (status === 'loading' || (waitingForSession && status !== 'authenticated')) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <span className="inline-block h-8 w-8 border-[3px] border-teal/20 border-t-teal rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    window.location.href = '/login';
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const token = session?.accessToken || (session?.user as Record<string, unknown>)?.accessToken;
      const res = await fetch(`${API_BASE}/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password, confirm_password: confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail || 'Failed to set password. Please try again.');
        return;
      }

      setSuccess(true);
      await signOut({ redirect: false });
      window.location.href = '/login';
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex bg-teal flex-col p-12 relative overflow-hidden">
        <div className="absolute -bottom-[60px] -right-[60px] w-[320px] h-[320px] rounded-full bg-white/[0.06]" />
        <div className="absolute -top-[40px] right-[80px] w-[180px] h-[180px] rounded-full bg-white/[0.04]" />

        <div className="relative z-10 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none" aria-hidden>
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.13 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.7 68.17 26.78 C83.56 16.94 97.7 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
          </svg>
          <span className="text-white text-[28px] font-extrabold tracking-[0.18em] leading-none">KAIVO</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-[36px] font-extrabold text-white leading-[1.2] tracking-[-0.5px] mb-4">
            Almost there!
          </h2>
          <p className="text-[15px] text-white/75 font-medium leading-[1.6] max-w-[360px]">
            Set a password so you can sign in anytime. This only takes a moment.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex items-center justify-center p-12 bg-white">
        <div className="w-full max-w-[400px]">
          {success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a9d8f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="text-[22px] font-extrabold text-text-primary">Password set!</h1>
              <p className="text-[14px] text-text-muted font-medium">Redirecting to login...</p>
            </div>
          ) : (
          <>
          <h1 className="text-[26px] font-extrabold text-text-primary mb-[6px]">Set your password</h1>
          <p className="text-[13px] text-text-muted font-medium mb-8">
            Create a password for <strong>{session?.user?.email}</strong> so you can sign in later.
          </p>

          {error && (
            <div className="bg-red-light border-[1.5px] border-[#f5c0c0] rounded-lg px-[14px] py-[10px] text-[12.5px] font-semibold text-red mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-[6px] mb-4">
              <label className="text-[11px] font-bold text-text-secondary tracking-wide">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="py-[11px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
              />
            </div>

            <div className="flex flex-col gap-[6px] mb-6">
              <label className="text-[11px] font-bold text-text-secondary tracking-wide">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                className={`py-[11px] px-[14px] border-2 rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors ${error ? 'border-red' : 'border-cream-border'}`}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-[13px] bg-teal hover:bg-teal-dark text-white font-extrabold text-[14px] rounded-[10px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Setting password...' : 'Set Password & Continue'}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <span className="inline-block h-8 w-8 border-[3px] border-teal/20 border-t-teal rounded-full animate-spin" />
        </div>
      }
    >
      <SetPasswordContent />
    </Suspense>
  );
}
