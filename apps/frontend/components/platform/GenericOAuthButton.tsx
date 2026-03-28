import React, { useState, cloneElement } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { SocialIcon } from 'react-social-icons';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

interface GenericOAuthButtonProps {
  platform: string;
  name: string;
  accountId: number;
  icon?: React.ReactNode;
  onSuccess?: () => void;
  disabled?: boolean;
}

// Platform-specific styling: gradient backgrounds + hover states
const platformStyles: Record<string, { bg: string; hover: string; ring: string }> = {
  meta:          { bg: 'bg-gradient-to-r from-blue-600 to-blue-500',         hover: 'hover:from-blue-700 hover:to-blue-600',       ring: 'focus-visible:ring-blue-500/40' },
  google_ads:    { bg: 'bg-gradient-to-r from-emerald-600 to-emerald-500',   hover: 'hover:from-emerald-700 hover:to-emerald-600', ring: 'focus-visible:ring-emerald-500/40' },
  tiktok:        { bg: 'bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-700', hover: 'hover:from-black hover:to-gray-900', ring: 'focus-visible:ring-gray-500/40' },
  reddit:        { bg: 'bg-gradient-to-r from-orange-600 to-orange-500',     hover: 'hover:from-orange-700 hover:to-orange-600',   ring: 'focus-visible:ring-orange-500/40' },
  microsoft_ads: { bg: 'bg-gradient-to-r from-sky-600 to-sky-500',           hover: 'hover:from-sky-700 hover:to-sky-600',         ring: 'focus-visible:ring-sky-500/40' },
  spotify:       { bg: 'bg-gradient-to-r from-green-600 to-green-500',       hover: 'hover:from-green-700 hover:to-green-600',     ring: 'focus-visible:ring-green-500/40' },
};

const defaultStyle = { bg: 'bg-gradient-to-r from-teal-600 to-teal-500', hover: 'hover:from-teal-700 hover:to-teal-600', ring: 'focus-visible:ring-teal-500/40' };

export function GenericOAuthButton({ platform, name, accountId, icon, onSuccess, disabled = false }: GenericOAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = platformStyles[platform.toLowerCase()] || defaultStyle;

  const getOAuthEndpoint = () => {
    switch (platform.toLowerCase()) {
      case 'meta':
        return API_ENDPOINTS.PLATFORM.META.OAUTH.INITIATE(accountId);
      case 'google_ads':
        return API_ENDPOINTS.PLATFORM.GOOGLE_ADS.OAUTH.INITIATE(accountId);
      case 'tiktok':
        return API_ENDPOINTS.PLATFORM.TIKTOK.OAUTH.INITIATE(accountId);
      case 'reddit':
        return API_ENDPOINTS.PLATFORM.REDDIT.OAUTH.INITIATE(accountId);
      case 'microsoft_ads':
        return API_ENDPOINTS.PLATFORM.MICROSOFT_ADS.OAUTH.INITIATE(accountId);
      case 'spotify':
        return API_ENDPOINTS.PLATFORM.SPOTIFY.OAUTH.INITIATE(accountId);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  };

  const getPlatformIcon = () => {
    
    switch (platform.toLowerCase()) {
      case 'meta':
        return (
          <svg width="16" height="16" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" className="mr-2 flex-shrink-0">
            <path d="M586.8 56C535.2 56 486 82.4 444 126.4C421.2 150.4 401.2 179.2 384.8 210.8L371.6 236L358.4 210.8C342 179.2 322 150.4 299.2 126.4C257.2 82.4 208 56 156.4 56C68 56 0 168 0 300C0 432 68 544 156.4 544C208 544 257.2 517.6 299.2 473.6C322 449.6 342 420.8 358.4 389.2L371.6 364L384.8 389.2C401.2 420.8 421.2 449.6 444 473.6C486 517.6 535.2 544 586.8 544C675.2 544 743.2 432 743.2 300C743.2 168 675.2 56 586.8 56ZM156.4 464C103.6 464 80 389.6 80 300C80 210.4 103.6 136 156.4 136C188 136 222 160 253.6 196.8C277.2 224.4 297.2 258 312.4 292L324 316.8L312.4 341.6C297.2 375.6 277.2 409.2 253.6 436.8C222 473.6 188 497.6 156.4 464ZM586.8 464C555.2 464 521.2 440 489.6 403.2C466 375.6 446 342 430.8 308L419.2 283.2L430.8 258.4C446 224.4 466 190.8 489.6 163.2C521.2 126.4 555.2 102.4 586.8 136C639.6 136 663.2 210.4 663.2 300C663.2 389.6 639.6 464 586.8 464Z" fill="white"/>
          </svg>
        );
      case 'google_ads':
        return (
          <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="mr-2 flex-shrink-0">
            <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
            <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.001-.001 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="white"/>
          </svg>
        );
      case 'tiktok':
        return <SocialIcon url="https://tiktok.com" style={{ width: '16px', height: '16px' }} className="mr-2 flex-shrink-0" />;
      case 'reddit':
        return <SocialIcon url="https://reddit.com" style={{ width: '16px', height: '16px' }} className="mr-2 flex-shrink-0" />;
      case 'microsoft_ads':
        return (
          <svg width="16" height="16" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg" className="mr-2 flex-shrink-0">
            <rect x="0" y="0" width="11" height="11" fill="#F25022"/>
            <rect x="12" y="0" width="11" height="11" fill="#7FBA00"/>
            <rect x="0" y="12" width="11" height="11" fill="white"/>
            <rect x="12" y="12" width="11" height="11" fill="#FFB900"/>
          </svg>
        );
      case 'spotify':
        return <SocialIcon url="https://spotify.com" style={{ width: '16px', height: '16px' }} className="mr-2 flex-shrink-0" />;
      default:
        return <SocialIcon url="https://facebook.com" style={{ width: '16px', height: '16px' }} className="mr-2 flex-shrink-0" />;
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<{
        success: boolean;
        oauth_url?: string;
        error?: string;
        message?: string;
      }>(getOAuthEndpoint());

      if (response.success && response.oauth_url) {
        window.location.href = response.oauth_url;
      } else {
        setError(response.error || response.message || 'Failed to initiate OAuth');
        setLoading(false);
      }
    } catch (err: any) {
      console.error(`${platform} OAuth initiation error:`, err);
      setError(err.message || `Failed to connect ${name} account`);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleConnect}
        disabled={loading || disabled}
        className={`
          group/btn w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
          text-sm font-semibold text-white shadow-lg
          ${style.bg} ${style.hover} ${style.ring}
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-300 ease-out
          hover:shadow-xl hover:-translate-y-0.5
          active:translate-y-0 active:shadow-md
        `}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            {getPlatformIcon()}
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">
              Connect {name}
            </span>
            <ArrowRight className="w-3.5 h-3.5 ml-1 opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-300" />
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-500 text-left px-1">{error}</p>
      )}
    </div>
  );
}