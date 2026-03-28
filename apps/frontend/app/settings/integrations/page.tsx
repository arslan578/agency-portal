'use client';

import React from 'react';
import { PlatformConnectionCard } from '@/components/platform/PlatformConnectionCard';
import {
  Sparkles,
  LinkIcon,
} from 'lucide-react';
import { SocialIcon } from 'react-social-icons';
import { useAuth } from '@/context/AuthContext';

export default function IntegrationsPage() {
  const { user, loading: authLoading } = useAuth();
  
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  const accountId = user?.id || 1;

  const platformConfigs = [
    {
      platform: 'meta',
      name: 'Meta (Facebook & Instagram)',
      icon: (
        <svg width="28" height="28" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
          <path d="M586.8 56C535.2 56 486 82.4 444 126.4C421.2 150.4 401.2 179.2 384.8 210.8L371.6 236L358.4 210.8C342 179.2 322 150.4 299.2 126.4C257.2 82.4 208 56 156.4 56C68 56 0 168 0 300C0 432 68 544 156.4 544C208 544 257.2 517.6 299.2 473.6C322 449.6 342 420.8 358.4 389.2L371.6 364L384.8 389.2C401.2 420.8 421.2 449.6 444 473.6C486 517.6 535.2 544 586.8 544C675.2 544 743.2 432 743.2 300C743.2 168 675.2 56 586.8 56ZM156.4 464C103.6 464 80 389.6 80 300C80 210.4 103.6 136 156.4 136C188 136 222 160 253.6 196.8C277.2 224.4 297.2 258 312.4 292L324 316.8L312.4 341.6C297.2 375.6 277.2 409.2 253.6 436.8C222 473.6 188 497.6 156.4 464ZM586.8 464C555.2 464 521.2 440 489.6 403.2C466 375.6 446 342 430.8 308L419.2 283.2L430.8 258.4C446 224.4 466 190.8 489.6 163.2C521.2 126.4 555.2 102.4 586.8 136C639.6 136 663.2 210.4 663.2 300C663.2 389.6 639.6 464 586.8 464Z" fill="#0081FB"/>
        </svg>
      ),
    },
    {
      platform: 'google_ads',
      name: 'Google Ads',
      icon: (
        <svg width="28" height="28" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
          <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
          <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
          <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.001-.001 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
        </svg>
      ),
    },
    {
      platform: 'tiktok',
      name: 'TikTok Ads',
      icon: <SocialIcon network="tiktok" style={{ width: 28, height: 28 }} />,
    },
    {
      platform: 'reddit',
      name: 'Reddit Ads',
      icon: <SocialIcon network="reddit" style={{ width: 28, height: 28 }} />,
    },
    {
      platform: 'microsoft_ads',
      name: 'Microsoft Ads',
      icon: (
        <svg width="24" height="24" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="11" height="11" fill="#F25022"/>
          <rect x="12" y="0" width="11" height="11" fill="#7FBA00"/>
          <rect x="0" y="12" width="11" height="11" fill="#00A4EF"/>
          <rect x="12" y="12" width="11" height="11" fill="#FFB900"/>
        </svg>
      ),
    },
    {
      platform: 'spotify',
      name: 'Spotify Ads',
      icon: <SocialIcon network="spotify" style={{ width: 28, height: 28 }} />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-kaivo-teal/20 dark:border-kaivo-teal/10 bg-gradient-to-r from-kaivo-teal/[0.04] via-transparent to-kaivo-aqua/[0.04]">
        {/* Decorative gradient orb */}
        <div className="absolute -left-20 -top-20 w-40 h-40 bg-kaivo-aqua/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-kaivo-teal/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-4 p-5">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-kaivo-teal/10 to-kaivo-aqua/10 border border-kaivo-teal/20 flex-shrink-0">
            <LinkIcon className="h-5 w-5 text-kaivo-teal" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Platform Integrations
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect your advertising platforms to launch cross-channel campaigns from one place.
            </p>
          </div>
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {platformConfigs.map((config) => (
          <PlatformConnectionCard
            key={config.platform}
            platform={config.platform}
            name={config.name}
            icon={config.icon}
            accountId={accountId}
          />
        ))}
      </div>

      {/* Info Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-kaivo-teal/20 dark:border-kaivo-teal/10 bg-gradient-to-r from-kaivo-teal/[0.04] via-transparent to-kaivo-aqua/[0.04]">
        {/* Decorative gradient orb */}
        <div className="absolute -right-20 -top-20 w-40 h-40 bg-kaivo-teal/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex items-start gap-4 p-5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-kaivo-teal/10 border border-kaivo-teal/20 flex-shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-kaivo-teal" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-1">
              About Platform Integrations
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect your advertising accounts to launch campaigns across multiple platforms simultaneously.
              Once connected, you can create cross-platform campaigns directly from the campaign builder.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}