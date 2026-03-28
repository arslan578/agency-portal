"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";

  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"login" | "forgot">("login");
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [loginError, setLoginError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!formData.email || !formData.password) {
      setLoginError("Please enter your email and password.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });
      if (result?.error) {
        setLoginError("Incorrect email or password. Please try again.");
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setLoginError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSent(true);
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex bg-teal flex-col p-12 relative overflow-hidden">
        {/* Background circles */}
        <div className="absolute -bottom-[60px] -right-[60px] w-[320px] h-[320px] rounded-full bg-white/[0.06]" />
        <div className="absolute -top-[40px] right-[80px] w-[180px] h-[180px] rounded-full bg-white/[0.04]" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none" aria-hidden>
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.13 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.7 68.17 26.78 C83.56 16.94 97.7 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
          </svg>
          <span className="text-white text-[28px] font-extrabold tracking-[0.18em] leading-none">KAIVO</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-[36px] font-extrabold text-white leading-[1.2] tracking-[-0.5px] mb-4">
            The intelligence layer for modern advertising
          </h2>
          <p className="text-[15px] text-white/75 font-medium leading-[1.6] max-w-[360px]">
            One platform to connect, optimise, and understand every ad campaign across all your clients.
          </p>

          <div className="flex gap-8 mt-10">
            <div>
              <div className="text-[28px] font-bold text-white font-mono leading-none">13+</div>
              <div className="text-[11px] text-white/65 font-semibold mt-1 tracking-wide">Ad platforms</div>
            </div>
            <div>
              <div className="text-[28px] font-bold text-white font-mono leading-none">AI</div>
              <div className="text-[11px] text-white/65 font-semibold mt-1 tracking-wide">Powered insights</div>
            </div>
            <div>
              <div className="text-[28px] font-bold text-white font-mono leading-none">1</div>
              <div className="text-[11px] text-white/65 font-semibold mt-1 tracking-wide">Dashboard</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex items-center justify-center p-12 bg-white">
        <div className="w-full max-w-[400px]">
          {view === "login" ? (
            <>
              <h1 className="text-[26px] font-extrabold text-text-primary mb-[6px]">Welcome back</h1>
              <p className="text-[13px] text-text-muted font-medium mb-8">Sign in to your agency account</p>

              {loginError && (
                <div className="bg-red-light border-[1.5px] border-[#f5c0c0] rounded-lg px-[14px] py-[10px] text-[12.5px] font-semibold text-red mb-4">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-[6px] mb-4">
                  <label className="text-[11px] font-bold text-text-secondary tracking-wide">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="you@agency.com"
                    autoComplete="email"
                    className="py-[11px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-[6px] mb-4">
                  <label className="text-[11px] font-bold text-text-secondary tracking-wide">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    className={`py-[11px] px-[14px] border-2 rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors ${loginError ? 'border-red' : 'border-cream-border'}`}
                    value={formData.password}
                    onChange={(e) => { setFormData({ ...formData, password: e.target.value }); setLoginError(""); }}
                  />
                </div>

                <div className="text-right -mt-[10px] mb-4">
                  <button
                    type="button"
                    onClick={() => setView("forgot")}
                    className="text-[12px] font-bold text-teal hover:text-teal-dark"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-[13px] bg-teal hover:bg-teal-dark text-white font-extrabold text-[14px] rounded-[10px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mb-6"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-cream-border" />
                <span className="text-[11px] text-text-muted font-semibold">New to Kaivo?</span>
                <div className="flex-1 h-px bg-cream-border" />
              </div>

              <p className="text-center text-[13px] text-text-muted font-medium">
                Don&apos;t have an account?{" "}
                <a href="mailto:sales@getkaivo.com" className="text-teal font-bold hover:text-teal-dark no-underline">
                  Contact us to get started →
                </a>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setView("login"); setResetSent(false); }}
                className="flex items-center gap-[6px] text-[12px] font-bold text-text-muted hover:text-teal mb-6"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3L5 8l5 5" /></svg>
                Back to sign in
              </button>

              <h1 className="text-[26px] font-extrabold text-text-primary mb-[6px]">Reset password</h1>
              <p className="text-[13px] text-text-muted font-medium mb-8">
                Enter your email and we&apos;ll send you a reset link
              </p>

              {resetSent ? (
                <div className="bg-teal-light border-[1.5px] border-[#b8e0db] rounded-lg p-[14px] text-[13px] font-semibold text-teal-dark leading-[1.5]">
                  Reset link sent! Check your inbox at <strong>{resetEmail}</strong>. The link expires in 30 minutes.
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit}>
                  <div className="flex flex-col gap-[6px] mb-4">
                    <label className="text-[11px] font-bold text-text-secondary tracking-wide">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="you@agency.com"
                      className="py-[11px] px-[14px] border-2 border-cream-border rounded-[10px] text-[14px] font-medium text-text-primary bg-white placeholder:text-text-muted focus:outline-none focus:border-teal transition-colors"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-[13px] bg-teal hover:bg-teal-dark text-white font-extrabold text-[14px] rounded-[10px] transition-colors"
                  >
                    Send Reset Link
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-cream">
        <span className="inline-block h-6 w-6 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
