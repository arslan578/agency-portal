"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { signupSchema } from '@/lib/validation/schemas';

declare global {
    interface Window {
        google?: any;
    }
}

export default function SignUpPage() {
    const router = useRouter();
    const { refreshUser } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [address, setAddress] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { errors, validateField, setFieldTouched, validateForm } = useFormValidation(signupSchema);

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
        if (window.google && GOOGLE_CLIENT_ID) {
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleCallback
            });
            window.google.accounts.id.renderButton(
                document.getElementById("googleSignInBtn")!,
                { theme: "outline", size: "large", width: "100%", text: "signup_with" }
            );
        }
    }, [GOOGLE_CLIENT_ID]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        const isValid = validateForm({ email, password, confirmPassword, fullName });
        if (!isValid) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post<{ id: number, email: string }>(API_ENDPOINTS.AUTH.REGISTER, {
                email,
                password,
                full_name: fullName,
                phone_number: phone,
                company_name: company
            });

            const loginRes = await apiClient.post<{ access_token: string }>(API_ENDPOINTS.AUTH.LOGIN, {
                email,
                password
            });

            if (loginRes.access_token) {
                localStorage.setItem('kaivo_token', loginRes.access_token);
                router.push('/dashboard');
            } else {
                router.push('/auth/signin?success=registered');
            }

        } catch (err: any) {
            console.error('Signup error:', err);
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 py-8 overflow-y-auto">
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
                            { theme: "outline", size: "large", width: "100%", text: "signup_with" }
                        );
                    }
                }}
            />

            <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 my-8">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-foreground mb-2">Create Account</h1>
                    <p className="text-gray-400">Join Kaivo to start optimizing your campaigns</p>
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

                <form onSubmit={handleSignup} className="space-y-4">
                    <FormField
                        label="Full Name"
                        name="fullName"
                        type="text"
                        value={fullName}
                        onChange={(value) => {
                            setFullName(value);
                            if (errors.fullName) validateField('fullName', value);
                        }}
                        onBlur={() => {
                            setFieldTouched('fullName');
                            validateField('fullName', fullName);
                        }}
                        error={errors.fullName}
                        success={!errors.fullName && fullName.length > 0}
                        required
                        placeholder="Your Name"
                    />

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
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Phone</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full bg-black/20 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-kaivo-teal-neon"
                                placeholder="+1..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Company</label>
                            <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                className="w-full bg-black/20 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-kaivo-teal-neon"
                                placeholder="Inc."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Address</label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="w-full bg-black/20 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-kaivo-teal-neon"
                            placeholder="Street, City, Zip"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/20 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-kaivo-teal-neon"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-black/20 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:border-kaivo-teal-neon"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-primary-foreground font-semibold py-2 px-4 rounded hover:bg-primary/90 transition-colors flex justify-center items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>

                    <div className="text-center mt-4">
                        <p className="text-sm text-gray-500">
                            Already have an account? <a href="/auth/signin" className="text-primary hover:underline">Sign In</a>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}
