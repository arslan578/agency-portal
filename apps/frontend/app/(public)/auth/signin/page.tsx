"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import Script from 'next/script';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { loginSchema } from '@/lib/validation/schemas';

declare global {
    interface Window {
        google?: any;
    }
}

export default function SignInPage() {
    const router = useRouter();
    const { isAuthenticated, loading: authLoading, refreshUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { errors, validateField, setFieldTouched, validateForm } = useFormValidation(loginSchema);

    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    const handleGoogleCallback = async (response: any) => {
        try {
            setLoading(true);
            const res = await apiClient.post<{ access_token: string }>('/auth/google', {
                id_token: response.credential
            });
            if (res.access_token) {
                localStorage.setItem('kaivo_token', res.access_token);
                await refreshUser();
                router.push('/dashboard');
            }
        } catch (err: any) {
            console.error('Google Auth Error:', err);
            setError('Google Sign-In failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.push('/dashboard');
        }
    }, [isAuthenticated, authLoading, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        // Frontend-only demo login shortcut
        if (email === 'demo@kaivo.com' && password === 'demo1234') {
            try {
                setLoading(true);
                setError('');
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('kaivo_token', 'demo-token');
                }
                await refreshUser();
                router.push('/dashboard');
                return;
            } catch (err: any) {
                console.error('Demo login error:', err);
                setError('Demo login failed. Please try again.');
            } finally {
                setLoading(false);
            }
        }

        const isValid = validateForm({ email, password });
        if (!isValid) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post<{ access_token: string }>('/auth/login', {
                email,
                password
            });

            if (res.access_token) {
                localStorage.setItem('kaivo_token', res.access_token);
                await refreshUser();
                router.push('/dashboard');
            } else {
                setError('Login failed: No access token received');
            }
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="lazyOnload"
                onLoad={() => {
                    if (window.google && GOOGLE_CLIENT_ID) {
                        window.google.accounts.id.initialize({
                            client_id: GOOGLE_CLIENT_ID,
                            callback: handleGoogleCallback
                        });
                        window.google.accounts.id.renderButton(
                            document.getElementById("googleSignInBtn")!,
                            { theme: "outline", size: "large", width: "100%", text: "signin_with" }
                        );
                    }
                }}
            />
            <div className="max-w-md w-full bg-card border border-border rounded-lg p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-foreground mb-2">Welcome Back</h1>
                    <p className="text-gray-400">Sign in to your Kaivo account</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded mb-4">
                        {error}
                    </div>
                )}

                {/* Google Button Container */}
                <div className="h-12 mb-6 flex justify-center w-full">
                    <div id="googleSignInBtn" className="w-full"></div>
                </div>
                {!GOOGLE_CLIENT_ID && (
                    <p className="text-xs text-yellow-500 text-center mb-4">
                        Google Auth not configured (Missing Client ID)
                    </p>
                )}

                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-card text-gray-500">Or continue with email</span>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <FormField
                        label="Email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(value) => {
                            setEmail(value);
                            if (errors.email) validateField('email', value);
                        }}
                        onBlur={() => {
                            setFieldTouched('email');
                            validateField('email', email);
                        }}
                        error={errors.email}
                        success={!errors.email && email.length > 0}
                        required
                        placeholder="you@example.com"
                    />
                    <FormField
                        label="Password"
                        name="password"
                        type="password"
                        value={password}
                        onChange={(value) => {
                            setPassword(value);
                            if (errors.password) validateField('password', value);
                        }}
                        onBlur={() => {
                            setFieldTouched('password');
                            validateField('password', password);
                        }}
                        error={errors.password}
                        success={!errors.password && password.length > 0}
                        required
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-primary-foreground font-semibold py-2 px-4 rounded hover:bg-primary/90 transition-colors flex justify-center items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>

                    <div className="text-center mt-4">
                        <p className="text-sm text-gray-500">
                            Don&apos;t have an account? <a href="/auth/signup" className="text-primary hover:underline">Sign up</a>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
