'use client'

import React, { useState, useEffect, Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Sparkles, Settings2, Upload, Target, MapPin, Users, Calendar, DollarSign, Zap, FileText, Loader2, CheckCircle, Store, AlertCircle } from 'lucide-react';
import { ZipCodeInput } from '@/components/ui/ZipCodeInput';
import { askKaivo } from '@/lib/agent';
import { apiClient } from '@/lib/api/client';
import { LANGUAGES } from '@/lib/languages';
import { usdToCents } from '@/lib/money';
import { toast } from 'sonner';
import { CreationProgress } from '@/components/campaign/CreationProgress';

type PlatformDef = { id: string; label: string; category: string };

const PLATFORM_DEFS: PlatformDef[] = [
    { id: 'youtube', label: 'YouTube', category: 'streaming_tv' },
    { id: 'roku', label: 'Roku', category: 'streaming_tv' },

    { id: 'tiktok', label: 'TikTok', category: 'social_media' },
    { id: 'facebook', label: 'Facebook', category: 'social_media' },
    { id: 'instagram', label: 'Instagram', category: 'social_media' },
    { id: 'x', label: 'X (Twitter)', category: 'social_media' },
    { id: 'snapchat', label: 'Snapchat', category: 'social_media' },

    { id: 'google_ads', label: 'Google Ads', category: 'display_search' },
    { id: 'microsoft_ads', label: 'Microsoft Ads', category: 'display_search' },
    { id: 'amazon_ads', label: 'Amazon Ads', category: 'display_search' },
    { id: 'reddit', label: 'Reddit', category: 'display_search' },

    { id: 'spotify', label: 'Spotify', category: 'audio_video' },
    { id: 'iheartmedia', label: 'iHeartMedia', category: 'audio_video' },
    { id: 'vevo', label: 'Vevo', category: 'audio_video' },
    { id: 'siriusxm', label: 'SiriusXM', category: 'audio_video' },
];

const CATEGORIES = ['streaming_tv', 'social_media', 'display_search', 'audio_video'];

interface ProductDoc {
    id: number;
    title: string;
    file_type: string;
}

interface Variant {
    text: string;
    score: number;
    tone?: string;
    rationale?: string;
}

interface GeneratedVariants {
    headline_short?: Variant[];
    headline_long?: Variant[];
    body?: Variant[];
    keywords?: string[];
    cta?: Variant[];
}


import { COUNTRIES, US_STATES } from '@/data/geoData';
import { cn } from '@/lib/utils';
import { apiClient as api } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCloudinaryUpload, CloudinaryUploadResult } from '@/lib/cloudinary';
import { FileUploadZone, UploadedFilePreview } from '@/components/upload/FileUploadZone';
import { useAgency } from '@/context/AgencyContext';
import { ClientSelector } from '@/components/agency/ClientSelector';

function NewCampaignPageContent() {
    const [mode, setMode] = useState<'ai' | 'manual' | null>(null);
    const [campaignName, setCampaignName] = useState('');
    const [objective, setObjective] = useState('');
    const [budget, setBudget] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentClient, clients, loading: clientsLoading, setCurrentClient } = useAgency();

    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [geography, setGeography] = useState<{
        countries: string[];
        states: string[];
        cities: string[];
        dmas: string[];
        zipcodes: string[];
    }>({ countries: [], states: [], cities: [], dmas: [], zipcodes: [] });
    const [demographics, setDemographics] = useState<{ ageMin: string; ageMax: string; gender: string; income: string }>({ ageMin: '', ageMax: '', gender: 'All', income: 'All Incomes' });

    // Targeting controls
    const [interests, setInterests] = useState<string[]>([]);
    const [interestInput, setInterestInput] = useState('');
    const [targetingLanguages, setTargetingLanguages] = useState<string[]>([]);

    // Search filters for dropdowns
    const [countrySearch, setCountrySearch] = useState('');
    const [stateSearch, setStateSearch] = useState('');
    const [langTargetSearch, setLangTargetSearch] = useState('');
    const [showCountryDropdown, setShowCountryDropdown] = useState(false);
    const [showStateDropdown, setShowStateDropdown] = useState(false);
    const [showLangTargetDropdown, setShowLangTargetDropdown] = useState(false);

    const [productBrief, setProductBrief] = useState('');
    const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariants | null>(null);
    const [generating, setGenerating] = useState(false);
    const [creationProgress, setCreationProgress] = useState<string[]>([]);
    const [currentProgressStep, setCurrentProgressStep] = useState(0);

    const [primaryHeadline, setPrimaryHeadline] = useState('');
    const [primaryBody, setPrimaryBody] = useState('');
    const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<'image' | 'video' | 'audio' | null>(null);

    const [selectedHeadlines, setSelectedHeadlines] = useState<string[]>([]);
    const [selectedBodyCopy, setSelectedBodyCopy] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [targetLanguages, setTargetLanguages] = useState<string[]>([]);
    const [translatedVariants, setTranslatedVariants] = useState<any>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [geoRecommendations, setGeoRecommendations] = useState<Array<{ code: string; name: string }>>([]);

    const [shopifyShopDomain, setShopifyShopDomain] = useState('');
    const [shopifyProductId, setShopifyProductId] = useState('');
    const [shopifyProducts, setShopifyProducts] = useState<Array<{ id: string; title: string; image_url?: string }>>([]);
    const [fetchingProducts, setFetchingProducts] = useState(false);
    const [shopifyConnectionStatus, setShopifyConnectionStatus] = useState<'unknown' | 'connected' | 'not_connected'>('unknown');
    const [checkingConnection, setCheckingConnection] = useState(false);

    const [audiences, setAudiences] = useState<Array<{ id: number; name: string }>>([]);
    const [audiencesLoading, setAudiencesLoading] = useState(false);
    const [selectedAudienceId, setSelectedAudienceId] = useState<number | ''>('');
    const [showShopifyModal, setShowShopifyModal] = useState(false);
    const [modalShopDomain, setModalShopDomain] = useState('');
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [disconnectingShopify, setDisconnectingShopify] = useState(false);

    const [adAccounts, setAdAccounts] = useState<Array<{id: string, name: string, account_id: string}>>([]);
    const [selectedAdAccount, setSelectedAdAccount] = useState('');
    const [adAccountsError, setAdAccountsError] = useState<string | null>(null);
    const [adAccountsLoading, setAdAccountsLoading] = useState(false);

    const [spotifyAdAccounts, setSpotifyAdAccounts] = useState<Array<{id: string, name: string, account_id: string}>>([]);
    const [selectedSpotifyAdAccount, setSelectedSpotifyAdAccount] = useState('');
    const [spotifyAdAccountsError, setSpotifyAdAccountsError] = useState<string | null>(null);
    const [spotifyAdAccountsLoading, setSpotifyAdAccountsLoading] = useState(false);
    
    const [googleAdsAccountInfo, setGoogleAdsAccountInfo] = useState<{name: string; id: number} | null>(null);
    const [googleAdsLoading, setGoogleAdsLoading] = useState(false);
    
    // Load saved targeting data from localStorage on mount
    React.useEffect(() => {
        try {
            const saved = localStorage.getItem('kaivo_campaign_targeting');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.geography) setGeography(data.geography);
                if (data.targetingLanguages) setTargetingLanguages(data.targetingLanguages);
                if (data.interests) setInterests(data.interests);
                if (data.demographics) setDemographics(data.demographics);
            }
        } catch (e) {
            // Ignore parse errors
        }
    }, []);

    // Auto-save targeting data to localStorage when in manual mode
    React.useEffect(() => {
        if (mode === 'manual') {
            try {
                const data = {
                    geography,
                    targetingLanguages,
                    interests,
                    demographics,
                };
                localStorage.setItem('kaivo_campaign_targeting', JSON.stringify(data));
            } catch (e) {
                // Ignore write errors
            }
        }
    }, [mode, geography, targetingLanguages, interests, demographics]);

    // Load saved variants from query param (API-backed)
    React.useEffect(() => {
        const variantsId = searchParams.get('variants');
        if (!variantsId) return;

        const loadFromApi = async () => {
            try {
                const saved = await api.get<{
                    id: number;
                    brief: string;
                    objective: string | null;
                    target_lang: string;
                    variants_json: Record<string, any[]>;
                }>(API_ENDPOINTS.CREATIVE.GET_VARIANT(variantsId));

                if (saved && saved.variants_json) {
                    const convertedVariants: GeneratedVariants = {};

                    Object.entries(saved.variants_json).forEach(([type, variants]: [string, any]) => {
                        if (type === 'headline_short' || type === 'headline_long' || type === 'body' || type === 'cta') {
                            convertedVariants[type as keyof GeneratedVariants] = variants.map((v: any) => ({
                                text: v.text,
                                score: v.score,
                                tone: v.tone,
                                rationale: v.rationale
                            }));
                        }
                    });

                    setGeneratedVariants(convertedVariants);
                    if (saved.brief) {
                        setProductBrief(saved.brief);
                    }
                    if (saved.target_lang) {
                        setSourceLanguage(saved.target_lang);
                    }

                    toast.success('Variants loaded from saved creative!');
                    router.replace('/plans/new', { scroll: false });
                }
            } catch (error) {
                console.error('Failed to load saved variants:', error);
                toast.error('Failed to load saved variants');
            }
        };

        loadFromApi();
    }, [searchParams, router]);
    
    React.useEffect(() => {
        const fetchGeoRecs = async () => {
            if (geography.countries.length > 0) {
                try {
                    const res = await api.post<{ recommendations: Array<{ code: string; name: string }> }>(
                        '/creative/recommend-languages', // Check if endpoint exists, otherwise use relative
                        { countries: geography.countries }
                    );
                    setGeoRecommendations(res.recommendations);
                } catch (e) {
                }
            } else {
                setGeoRecommendations([]);
            }
        };
        if (geography.countries.length > 0) fetchGeoRecs();
    }, [geography.countries]);

    // Fetch Meta ad accounts when Meta/Facebook is selected
    React.useEffect(() => {
        const fetchAdAccounts = async () => {
            if ((selectedPlatforms.includes('facebook') || selectedPlatforms.includes('meta')) &&
                !adAccountsLoading && adAccounts.length === 0) {

                try {
                    setAdAccountsLoading(true);
                    setAdAccountsError(null);

                    console.log('Fetching Meta ad accounts...');
                    const response = await apiClient.get<{
                        success: boolean;
                        ad_accounts?: Array<{id: string, name: string, account_id: string}>;
                        error?: string;
                        error_code?: string;
                    }>(API_ENDPOINTS.PLATFORM.META.AD_ACCOUNTS);
                    console.log('Meta ad accounts API response:', response);

                    if (response.success && response.ad_accounts) {
                        setAdAccounts(response.ad_accounts);
                        if (response.ad_accounts.length === 0) {
                            setAdAccountsError('No ad accounts found. Please check your Meta Ads access.');
                        }
                    } else {
                        const errorCode = response.error_code;
                        let errorMessage = response.error || 'Failed to fetch ad accounts';

                        if (errorCode === 'INVALID_TOKEN') {
                            errorMessage = 'Meta access token is expired or invalid. Please reconnect your Meta account.';
                        } else if (errorCode === 'RATE_LIMIT') {
                            errorMessage = 'Meta API rate limit exceeded. Please try again later.';
                        } else if (errorCode === 'MISSING_TOKEN') {
                            errorMessage = 'Meta access token not configured. Please set META_ACCESS_TOKEN in backend.';
                        }

                        setAdAccountsError(errorMessage);
                    }
                } catch (error: any) {
                    console.error('Meta ad accounts fetch error:', error);
                    setAdAccountsError(error.message || 'Network error while fetching ad accounts');
                } finally {
                    setAdAccountsLoading(false);
                }
            }
        };

        fetchAdAccounts();
    }, [selectedPlatforms]);

    const refreshAdAccounts = async () => {
        try {
            setAdAccountsLoading(true);
            setAdAccountsError(null);
            setAdAccounts([]); // Clear previous accounts

            console.log('Manually refreshing Meta ad accounts...');
            const response = await apiClient.get<{
                success: boolean;
                ad_accounts?: Array<{id: string, name: string, account_id: string}>;
                error?: string;
                error_code?: string;
            }>(API_ENDPOINTS.PLATFORM.META.AD_ACCOUNTS);
            console.log('Meta ad accounts refresh response:', response);

            if (response.success && response.ad_accounts) {
                setAdAccounts(response.ad_accounts);
                if (response.ad_accounts.length === 0) {
                    setAdAccountsError('No ad accounts found. Please check your Meta Ads access.');
                }
            } else {
                // Handle specific error types
                const errorCode = response.error_code;
                let errorMessage = response.error || 'Failed to fetch ad accounts';

                if (errorCode === 'INVALID_TOKEN') {
                    errorMessage = 'Meta access token is expired or invalid. Please reconnect your Meta account.';
                } else if (errorCode === 'RATE_LIMIT') {
                    errorMessage = 'Meta API rate limit exceeded. Please try again later.';
                } else if (errorCode === 'MISSING_TOKEN') {
                    errorMessage = 'Meta access token not configured. Please set META_ACCESS_TOKEN in backend.';
                }

                setAdAccountsError(errorMessage);
            }
        } catch (error: any) {
            console.error('Meta ad accounts refresh error:', error);
            setAdAccountsError(error.message || 'Network error while refreshing ad accounts');
        } finally {
            setAdAccountsLoading(false);
        }
    };

    // Fetch Spotify ad accounts when Spotify is selected
    React.useEffect(() => {
        const fetchSpotifyAdAccounts = async () => {
            if (selectedPlatforms.includes('spotify') &&
                !spotifyAdAccountsLoading && spotifyAdAccounts.length === 0) {
                try {
                    setSpotifyAdAccountsLoading(true);
                    setSpotifyAdAccountsError(null);

                    console.log('[Spotify Ad Accounts] Fetching ad accounts...');

                    const response = await apiClient.get<{
                        success: boolean;
                        ad_accounts?: Array<{id: string, name: string, account_id: string}>;
                        error?: string;
                        error_code?: string;
                        message?: string;
                    }>(API_ENDPOINTS.PLATFORM.SPOTIFY.AD_ACCOUNTS);

                    console.log('[Spotify Ad Accounts] API response:', response);

                    if (response.success && response.ad_accounts) {
                        console.log('[Spotify Ad Accounts] Found accounts:', response.ad_accounts.length);
                        response.ad_accounts.forEach((acct, i) => {
                            console.log(`  [${i}] ${acct.name} (ID: ${acct.id})`);
                        });
                        setSpotifyAdAccounts(response.ad_accounts);
                        if (response.ad_accounts.length === 0) {
                            setSpotifyAdAccountsError(response.message || 'No Spotify ad accounts found. Create one at adsmanager.spotify.com.');
                        }
                    } else {
                        const errorCode = response.error_code;
                        let errorMessage = response.error || 'Failed to fetch Spotify ad accounts';
                        if (errorCode === 'INVALID_TOKEN') {
                            errorMessage = 'Spotify access token is expired or invalid. Please reconnect your Spotify account.';
                        } else if (errorCode === 'MISSING_TOKEN') {
                            errorMessage = 'Spotify not connected. Please connect your Spotify account on the Integrations page.';
                        }
                        setSpotifyAdAccountsError(errorMessage);
                    }
                } catch (error: any) {
                    console.error('Spotify ad accounts fetch error:', error);
                    setSpotifyAdAccountsError(error.message || 'Network error while fetching Spotify ad accounts');
                } finally {
                    setSpotifyAdAccountsLoading(false);
                }
            }
        };

        fetchSpotifyAdAccounts();
    }, [selectedPlatforms]);

    const refreshSpotifyAdAccounts = async () => {
        try {
            setSpotifyAdAccountsLoading(true);
            setSpotifyAdAccountsError(null);
            setSpotifyAdAccounts([]);

            const response = await apiClient.get<{
                success: boolean;
                ad_accounts?: Array<{id: string, name: string, account_id: string}>;
                error?: string;
                error_code?: string;
                message?: string;
            }>(API_ENDPOINTS.PLATFORM.SPOTIFY.AD_ACCOUNTS);

            if (response.success && response.ad_accounts) {
                setSpotifyAdAccounts(response.ad_accounts);
                if (response.ad_accounts.length === 0) {
                    setSpotifyAdAccountsError(response.message || 'No Spotify ad accounts found.');
                }
            } else {
                const errorCode = response.error_code;
                let errorMessage = response.error || 'Failed to fetch Spotify ad accounts';
                if (errorCode === 'INVALID_TOKEN') {
                    errorMessage = 'Spotify access token is expired or invalid. Please reconnect your Spotify account.';
                } else if (errorCode === 'MISSING_TOKEN') {
                    errorMessage = 'Spotify not connected. Please connect your Spotify account on the Integrations page.';
                }
                setSpotifyAdAccountsError(errorMessage);
            }
        } catch (error: any) {
            console.error('Spotify ad accounts refresh error:', error);
            setSpotifyAdAccountsError(error.message || 'Network error while refreshing Spotify ad accounts');
        } finally {
            setSpotifyAdAccountsLoading(false);
        }
    };

// Open modal for connecting Shopify
const openShopifyConnectModal = () => {
    setModalShopDomain('');
    setShowShopifyModal(true);
};

// Connect Shopify from modal
const handleConnectFromModal = () => {
    if (!modalShopDomain.trim()) {
        toast.error('Please enter your shop domain (e.g., your-store.myshopify.com)');
        return;
    }

    let normalizedDomain = modalShopDomain.trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '')
        .split('/')[0];

    setShopifyShopDomain(normalizedDomain);
    setShowShopifyModal(false);

    let tries = 0;
    const maxTries = 120; // ~2 minutes @ 1000ms interval
    let inFlight = false;
    let pollTimer: NodeJS.Timeout | null = null;
    let popupCheckTimer: NodeJS.Timeout | null = null;
    let isResolved = false; // Track if connection is already resolved
    let popup: Window | null = null;

    const cleanup = () => {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (popupCheckTimer) {
            clearInterval(popupCheckTimer);
            popupCheckTimer = null;
        }
        window.removeEventListener('message', handleMessage);
    };

    const handleMessage = (event: MessageEvent) => {
        if (event.data?.type !== 'SHOPIFY_AUTH_SUCCESS') return;

        const receivedDomain = event.data?.shop_domain?.toLowerCase().trim();
        const expectedDomain = normalizedDomain.toLowerCase().trim();
        
        if (receivedDomain && receivedDomain !== expectedDomain) {
            return;
        }

        isResolved = true;
        cleanup();
        
        // Update UI immediately (optimistic update)
        setShopifyConnectionStatus('connected');
        setShopifyShopDomain(normalizedDomain);

        setTimeout(() => {
            checkShopifyConnection(normalizedDomain);
        }, 300);

        try {
            popup?.close();
        } catch { }
    };
    
    window.addEventListener('message', handleMessage);

    const shopParam = encodeURIComponent(normalizedDomain);
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com';
    const authUrl = `${apiBaseUrl}/integrations/shopify/auth?shop=${shopParam}`;
    
    popup = window.open(authUrl, 'shopify-oauth', 'width=600,height=700');

    if (!popup) {
        window.removeEventListener('message', handleMessage);
        toast.warning('Popup was blocked. Please allow popups for this site and try again.');
        return;
    }

    popupCheckTimer = setInterval(() => {
        if (isResolved) {
            cleanup();
            return;
        }

        if (popup.closed) {
            cleanup();
            let retryCount = 0;
            const maxRetries = 8;
            const checkWithRetry = async () => {
                if (retryCount >= maxRetries) {
                    await checkShopifyConnection(normalizedDomain);
                    return;
                }
                
                const isConnected = await checkShopifyConnection(normalizedDomain);
                
                if (isConnected) {
                    return;
                }
                
                retryCount++;
                const delay = Math.min(300 * retryCount, 1500);
                setTimeout(checkWithRetry, delay);
            };
            
            setTimeout(checkWithRetry, 1000);
        }
    }, 300);

    pollTimer = setInterval(async () => {
        if (isResolved) {
            cleanup();
            return;
        }

        if (popup.closed) {
            cleanup();
            let retryCount = 0;
            const maxRetries = 8;
            const checkWithRetry = async () => {
                if (retryCount >= maxRetries) {
                    await checkShopifyConnection(normalizedDomain);
                    return;
                }
                
                const isConnected = await checkShopifyConnection(normalizedDomain);
                
                if (isConnected) {
                    return;
                }
                
                retryCount++;
                const delay = Math.min(300 * retryCount, 1500);
                setTimeout(checkWithRetry, delay);
            };
            
            setTimeout(checkWithRetry, 1000);
            return;
        }

        // Stop after max tries to avoid infinite polling
        if (tries++ >= maxTries) {
            cleanup();
            return;
        }

        if (inFlight) return;
        inFlight = true;

        try {
            const shopDomainParam = encodeURIComponent(normalizedDomain);
            const res = await api.get<{ connected: boolean; shop_domain: string }>(
                `/integrations/shopify/status?shop_domain=${shopDomainParam}`
            );

            if (res.connected) {
                isResolved = true;
                cleanup();
                setShopifyConnectionStatus('connected');
                setShopifyShopDomain(normalizedDomain);
                try {
                    popup.close();
                } catch { }
            }
        } catch (error) {
            console.error('[Shopify OAuth] Polling error:', error);
            // Ignore transient errors while OAuth is mid-flight
        } finally {
            inFlight = false;
        }
    }, 800);
};

const checkShopifyConnection = async (domain?: string): Promise<boolean> => {
    const shopDomain = domain || shopifyShopDomain;
    if (!shopDomain.trim()) {
        return false;
    }

    setCheckingConnection(true);
    try {
        const shopDomainParam = encodeURIComponent(shopDomain.trim());
        const response = await api.get<{ connected: boolean; shop_domain: string }>(
            `/integrations/shopify/status?shop_domain=${shopDomainParam}`
        );
        
        if (response.connected) {
            setShopifyConnectionStatus('connected');
            if (!shopifyShopDomain) {
                setShopifyShopDomain(shopDomain);
            }
            return true;
        } else {
            setShopifyConnectionStatus('not_connected');
            return false;
        }
    } catch (error: any) {
        setShopifyConnectionStatus('not_connected');
        return false;
    } finally {
        setCheckingConnection(false);
    }
};

const disconnectShopifyStore = async () => {
    if (!shopifyShopDomain.trim()) {
        return;
    }

    setShowDisconnectModal(true);
};

const confirmDisconnectShopifyStore = async () => {
    if (!shopifyShopDomain.trim()) return;
    setDisconnectingShopify(true);
    try {
        const shopDomainParam = encodeURIComponent(shopifyShopDomain.trim());
        await api.delete(`/integrations/shopify/disconnect?shop_domain=${shopDomainParam}`);
        
        setShopifyConnectionStatus('not_connected');
        setShopifyProducts([]);
        setShopifyProductId('');
        setShopifyShopDomain('');
        setShowDisconnectModal(false);
        
    } catch (error: any) {
        console.error('Failed to disconnect store:', error);
        toast.error(`Failed to disconnect: ${error.message || 'Unknown error'}`);
    } finally {
        setDisconnectingShopify(false);
    }
};

const fetchShopifyProducts = async () => {
    if (!shopifyShopDomain.trim()) {
        toast.error('Please enter a shop domain first (e.g., kaivo-dev.myshopify.com)');
        return;
    }

    setFetchingProducts(true);
    try {
        const shopDomainParam = encodeURIComponent(shopifyShopDomain.trim());
        const response = await api.get<{ products: Array<{ id: string; title: string; image_url?: string }>, shop_domain: string, count: number }>(
            `/integrations/shopify/products?shop_domain=${shopDomainParam}&limit=50`
        );
        setShopifyProducts(response.products || []);
        setShopifyConnectionStatus('connected');
    } catch (error: any) {
        console.error('Failed to fetch Shopify products:', error);
        toast.error(`Failed to fetch products: ${error.message || 'Unknown error'}`);
        setShopifyProducts([]);
        if (error.message?.includes('not connected')) {
            setShopifyConnectionStatus('not_connected');
        }
    } finally {
        setFetchingProducts(false);
    }
};
    const handleTranslate = async () => {
        if (targetLanguages.length === 0) {
            toast.error("Please select at least one target language.");
            return;
        }

        const itemsToTranslate: Record<string, string[]> = {};
        if (selectedHeadlines.length > 0) itemsToTranslate['headline'] = selectedHeadlines;
        if (selectedBodyCopy.length > 0) itemsToTranslate['body'] = selectedBodyCopy;
        if (primaryHeadline) itemsToTranslate['headline'] = [...(itemsToTranslate['headline'] || []), primaryHeadline];

        if (Object.keys(itemsToTranslate).length === 0) {
            toast.error("Please select or enter headlines/body copy to translate.");
            return;
        }

        setIsTranslating(true);
        try {
            const res = await api.post<any>(API_ENDPOINTS.I18N.TRANSLATE, {
                items: itemsToTranslate,
                target_languages: targetLanguages,
                source_language: sourceLanguage
            });
            setTranslatedVariants(res);
            toast.success("Translation completed successfully!");
        } catch (error) {
            toast.error("Translation failed. Please try again.");
        } finally {
            setIsTranslating(false);
        }
    };

    const handleAICampaignSubmit = async () => {
        if (!aiPrompt.trim()) {
            toast.error("Please describe your campaign goals.");
            return;
        }

        setGenerating(true);
        const progressSteps = [
            "Analyzing your campaign description...",
            "Extracting campaign requirements...",
            "Detecting target audience...",
            "Identifying platforms...",
            "Creating campaign resources..."
        ];
        setCreationProgress(progressSteps);
        setCurrentProgressStep(0);

        // Simulate progress updates
        const progressInterval = setInterval(() => {
            setCurrentProgressStep(prev => {
                if (prev < progressSteps.length - 1) {
                    return prev + 1;
                }
                return prev;
            });
        }, 1500);

        try {
            const message = `Create a campaign named "${campaignName || 'New Campaign'}" with budget ${budget || 'undecided'}. Goals: ${aiPrompt}`;
            const response = await askKaivo(message, {
                media_url: cloudinaryUrl || undefined,
                media_type: fileType || undefined,
                audience_id: selectedAudienceId && Number(selectedAudienceId) > 0 ? Number(selectedAudienceId) : undefined,
                client_id: currentClient?.id
            });

            clearInterval(progressInterval);
            setCurrentProgressStep(progressSteps.length);

            // Build toast description with AI insights
            let toastDescription = "Campaign created with AI intelligence";
            if (response.ai_insights && response.ai_insights.length > 0) {
                toastDescription += `\n\n${response.ai_insights.slice(0, 2).join('\n')}`;
                if (response.ai_insights.length > 2) {
                    toastDescription += `\n...and ${response.ai_insights.length - 2} more insights`;
                }
            }

            toast.success(response.explanation || "Campaign created successfully!", {
                description: toastDescription,
                duration: 5000,
                action: response.created_resources?.campaign_id ? {
                    label: "View Campaign",
                    onClick: () => router.push(`/campaigns/${response.created_resources?.campaign_id}`)
                } : undefined
            });
            
            setTimeout(() => {
                if (response.created_resources?.campaign_id) {
                    router.push(`/campaigns/${response.created_resources.campaign_id}`);
                } else {
                    router.push('/campaigns');
                }
            }, 2000);
        } catch (error) {
            clearInterval(progressInterval);
            toast.error("Failed to initiate AI campaign.");
        } finally {
            setGenerating(false);
            setCreationProgress([]);
            setCurrentProgressStep(0);
        }
    };

    const handleGenerateVariants = async (bypassCache = false) => {
        const effectiveBrief = productBrief || `${primaryHeadline} ${primaryBody}`;

        if (!effectiveBrief.trim()) {
            toast.error('Please enter a product brief or draft creative first');
            return;
        }

        setGenerating(true);
        try {
            const seedContent: Record<string, string> = {};
            if (primaryHeadline) seedContent['headline'] = primaryHeadline;
            if (primaryBody) seedContent['body'] = primaryBody;

            const res = await api.post<{ variants: GeneratedVariants }>(
                API_ENDPOINTS.CREATIVE.GENERATE, 
                {
                    brand_id: 1,
                    brief: effectiveBrief,
                    objective: objective || 'conversion',
                    audience: {
                        geo: geography.countries,
                        interests: interests,
                        languages: targetingLanguages.length > 0 ? targetingLanguages : (sourceLanguage !== 'auto' ? [sourceLanguage] : ['en']),
                    },
                    variant_types: ['headline_short', 'headline_long', 'body', 'cta', 'keywords'],
                    seed_content: seedContent,
                    bypass_cache: bypassCache
                },
                { timeout: 1200000 }
            );
            setGeneratedVariants(res.variants);
            toast.success('Creative variants generated successfully!');
        } catch (error) {
            toast.error('Error generating variants');
        } finally {
            setGenerating(false);
        }
    };

    const handleCreateCampaign = async () => {
        if (!campaignName.trim()) {
            toast.error('Please enter a campaign name.');
            return;
        }

        if (selectedPlatforms.length === 0) {
            toast.error('Please select at least one platform.');
            return;
        }

        if ((selectedPlatforms.includes('facebook') || selectedPlatforms.includes('meta')) && !selectedAdAccount) {
            toast.error('Please select a Meta ad account for Meta campaigns.');
            return;
        }

        if (selectedPlatforms.includes('spotify') && !selectedSpotifyAdAccount) {
            toast.error('Please select a Spotify ad account for Spotify campaigns.');
            return;
        }

        const totalBudgetCents = usdToCents(budget);
        if (totalBudgetCents <= 0) {
            toast.error('Please enter a valid budget (e.g., 10000 or 100.50).');
            return;
        }

        const platforms = [...selectedPlatforms].sort();
        const n = platforms.length;
        const base = Math.floor(totalBudgetCents / n);
        const remainder = totalBudgetCents - (base * n);

        const platform_allocations_json: Record<string, any> = {};
        platforms.forEach((p, index) => {
            const budget = base + (index < remainder ? 1 : 0);
            platform_allocations_json[p] = budget;

            if ((p === 'facebook' || p === 'meta') && selectedAdAccount) {
                platform_allocations_json[p] = {
                    budget: budget,
                    ad_account_id: selectedAdAccount
                };
            }

            if (p === 'spotify' && selectedSpotifyAdAccount) {
                platform_allocations_json[p] = {
                    budget: budget,
                    ad_account_id: selectedSpotifyAdAccount
                };
                console.log('[Spotify Campaign] Using ad_account_id:', selectedSpotifyAdAccount, 'budget:', budget);
            }
        });

        console.log('[Campaign Create] platform_allocations_json:', platform_allocations_json);

        // Get client_id from context or localStorage, with auto-select fallback
        let clientId = currentClient?.id 
            || (typeof window !== 'undefined' ? parseInt(localStorage.getItem('kaivo_current_client_id') || '0') : 0);
        
        // Auto-select first client if none selected and clients are available
        if ((!clientId || clientId === 0) && !clientsLoading && clients.length > 0) {
            clientId = clients[0].id;
            // Set it as current client if not already set
            if (!currentClient) {
                setCurrentClient(clients[0]);
            }
        }
        
        if (!clientId || clientId === 0) {
            if (clientsLoading) {
                toast.error('Loading clients, please wait...');
            } else if (clients.length === 0) {
                toast.error('No clients found. Please create a client first in Agency Settings.');
            } else {
                toast.error('Please select a client before creating a campaign.');
            }
            return;
        }

        try {
            const payload = {
                client_id: clientId,
                name: campaignName,
                goal: objective || 'conversion',
                total_budget_cents: totalBudgetCents,
                audience_id: selectedAudienceId && Number(selectedAudienceId) > 0 ? Number(selectedAudienceId) : undefined,
                platform_allocations_json,
                targeting: {
                    geography: {
                        countries: geography.countries,
                        states: geography.states,
                        cities: geography.cities.filter(Boolean),
                        dmas: geography.dmas.filter(Boolean),
                        zipcodes: geography.zipcodes,
                    },
                    languages: targetingLanguages,
                    interests: interests,
                    demographics: {
                        age_min: demographics.ageMin ? parseInt(demographics.ageMin) : undefined,
                        age_max: demographics.ageMax ? parseInt(demographics.ageMax) : undefined,
                        gender: demographics.gender !== 'All' ? demographics.gender : undefined,
                        income: demographics.income !== 'All Incomes' ? demographics.income : undefined,
                    },
                },
                shopify_shop_domain: shopifyShopDomain || undefined,
                shopify_product_id: shopifyProductId || undefined,
                media_url: cloudinaryUrl || undefined,
                media_type: fileType || undefined
            };
            await api.post(API_ENDPOINTS.CAMPAIGN.CREATE, payload);
            toast.success('Campaign created successfully!', {
                description: "Redirecting to campaigns...",
                duration: 3000
            });
            setTimeout(() => router.push('/campaigns'), 2000);
        } catch (error) {
            toast.error('Failed to create campaign.');
        }
    };

    const handlePlatformToggle = (platform: string) => {
        if (selectedPlatforms.includes(platform)) {
            setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform));
        } else {
            setSelectedPlatforms([...selectedPlatforms, platform]);
        }
    };

    React.useEffect(() => {
        if (!selectedPlatforms.includes('facebook') && !selectedPlatforms.includes('meta')) {
            setSelectedAdAccount('');
            setAdAccounts([]);
            setAdAccountsError(null);
        }
    }, [selectedPlatforms]);

    React.useEffect(() => {
        const checkGoogleAdsConnection = async () => {
            if (selectedPlatforms.includes('google_ads') && !googleAdsLoading && !googleAdsAccountInfo) {
                try {
                    setGoogleAdsLoading(true);
                    const response = await apiClient.post<{
                        success: boolean;
                        customer_info?: {id: number; name: string; currency: string; timezone: string};
                        error?: string;
                    }>(API_ENDPOINTS.PLATFORM.GOOGLE_ADS.TEST_CONNECTION, {});
                    
                    if (response.success && response.customer_info) {
                        setGoogleAdsAccountInfo({
                            name: response.customer_info.name,
                            id: response.customer_info.id
                        });
                    }
                } catch (error: any) {
                } finally {
                    setGoogleAdsLoading(false);
                }
            }
        };
        
        checkGoogleAdsConnection();
    }, [selectedPlatforms]);

    React.useEffect(() => {
        if (!selectedPlatforms.includes('google_ads')) {
            setGoogleAdsAccountInfo(null);
        }
    }, [selectedPlatforms]);

    React.useEffect(() => {
        if (!currentClient?.id) {
            setAudiences([]);
            setSelectedAudienceId('');
            return;
        }
        let cancelled = false;
        setAudiencesLoading(true);
        apiClient
            .get<Array<{ id: number; name: string; client_id?: number }>>(`${API_ENDPOINTS.AUDIENCE.LIST}?client_id=${currentClient.id}`)
            .then((data) => {
                if (!cancelled && Array.isArray(data)) {
                    setAudiences(data.map((a) => ({ id: a.id, name: a.name })));
                }
            })
            .catch(() => {
                if (!cancelled) setAudiences([]);
            })
            .finally(() => {
                if (!cancelled) setAudiencesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [currentClient?.id]);

    if (!mode) {
        return (
            <div className="max-w-4xl mx-auto py-12 px-4">
                <h1 className="text-4xl font-bold mb-3 text-kaivo-text-primary">New Campaign</h1>
                <p className="text-kaivo-text-secondary mb-4">Choose how you&apos;d like to build your campaign</p>

                {currentClient?.account_mode === 'reporting_only' && (
                    <div className="mb-8 rounded-lg border border-purple-500/20 bg-purple-500/5 px-5 py-3 text-sm text-purple-300">
                        <strong className="text-white">{currentClient.name}</strong> is in <strong>Reporting Only</strong> mode.
                        Campaigns created here won&apos;t consume ad credits &mdash; they&apos;ll use your own platform accounts.
                    </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                    {/* AI-Assisted Mode */}
                    <Card
                        className="p-8 cursor-pointer hover:border-kaivo-teal-neon transition-all group"
                        onClick={() => setMode('ai')}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-kaivo-teal-neon to-kaivo-teal-glow flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-kaivo-text-primary">AI-Assisted</h3>
                                <p className="text-sm text-kaivo-text-muted">Recommended</p>
                            </div>
                        </div>

                        <p className="text-kaivo-text-secondary mb-6">
                            Let Kaivo's intelligent orchestrator configure your campaign based on your goals. Fast, optimized, and data-driven.
                        </p>

                        <ul className="space-y-2 text-sm text-kaivo-text-secondary">
                            <li className="flex items-start gap-2">
                                <Zap className="w-4 h-4 text-kaivo-teal-neon shrink-0 mt-0.5" />
                                AI-powered platform selection
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap className="w-4 h-4 text-kaivo-teal-neon shrink-0 mt-0.5" />
                                Automatic audience optimization
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap className="w-4 h-4 text-kaivo-teal-neon shrink-0 mt-0.5" />
                                Smart budget allocation
                            </li>
                        </ul>

                        <button className={cn(buttonVariants({ variant: "glow" }), "w-full mt-6 group-hover:scale-105 transition-transform")}>
                            Start with AI
                        </button>
                    </Card>

                    {/* Manual Mode */}
                    <Card
                        className="p-8 cursor-pointer hover:border-gray-400 transition-all group"
                        onClick={() => setMode('manual')}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-500 flex items-center justify-center">
                                <Settings2 className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-kaivo-text-primary">Manual Configuration</h3>
                                <p className="text-sm text-kaivo-text-muted">Expert mode</p>
                            </div>
                        </div>

                        <p className="text-kaivo-text-secondary mb-6">
                            Full control over every targeting parameter, platform selection, and optimization setting. For advanced users.
                        </p>

                        <ul className="space-y-2 text-sm text-kaivo-text-secondary">
                            <li className="flex items-start gap-2">
                                <Target className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                                Granular platform selection
                            </li>
                            <li className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                                Custom geographic targeting
                            </li>
                            <li className="flex items-start gap-2">
                                <Users className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                                Detailed demographics control
                            </li>
                        </ul>

                        <button className={cn(buttonVariants({ variant: "outline" }), "w-full mt-6 group-hover:scale-105 transition-transform")}>
                            Configure Manually
                        </button>
                    </Card>
                </div>
            </div>
        );
    }

    // AI-Assisted Mode
    if (mode === 'ai') {
        return (
            <div className="max-w-4xl mx-auto py-12 px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-2 text-kaivo-text-primary">AI-Assisted Campaign</h1>
                        <p className="text-kaivo-text-secondary">Describe your campaign goals and let Kaivo optimize everything</p>
                    </div>
                    <button className={cn(buttonVariants({ variant: "ghost" }))} onClick={() => setMode(null)}>
                        Change Mode
                    </button>
                </div>

                {/* Client Selector */}
                <ClientSelector />

                <div className="space-y-6">
                    {/* Creation Progress */}
                    {generating && creationProgress.length > 0 && (
                        <CreationProgress 
                            steps={creationProgress}
                            currentStep={currentProgressStep}
                        />
                    )}

                    {/* Campaign Basics */}
                    <Card className="p-6">
                        <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary">Campaign Basics</h3>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="campaign-name">Campaign Name</Label>
                                <Input
                                    id="campaign-name"
                                    placeholder="e.g., Summer Sale 2025"
                                    value={campaignName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCampaignName(e.target.value)}
                                />
                            </div>

                            <div>
                                <Label htmlFor="budget">Total Budget</Label>
                                <Input
                                    id="budget"
                                    type="number"
                                    placeholder="e.g., 10000"
                                    value={budget}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBudget(e.target.value)}
                                />
                                <p className="text-sm text-kaivo-text-muted mt-1">USD per month</p>
                                <p className="text-xs text-kaivo-text-muted mt-1">
                                    Ad credits are consumed based on managed media spend. See Billing for current credit pricing.
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="ai-audience">Use existing audience</Label>
                                <select
                                    id="ai-audience"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                    value={selectedAudienceId}
                                    onChange={(e) => setSelectedAudienceId(e.target.value === '' ? '' : Number(e.target.value))}
                                    disabled={audiencesLoading || !currentClient}
                                >
                                    <option value="">Create new audience from description</option>
                                    {audiences.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-kaivo-text-muted mt-1">Optional: Reuse an audience you created under Audiences.</p>
                            </div>
                        </div>
                    </Card>

                    {/* AI Configuration */}
                    <Card className="p-6 border-kaivo-teal-neon/30 bg-gradient-to-br from-kaivo-teal-neon/5 to-transparent">
                        <div className="flex items-center gap-3 mb-4">
                            <Sparkles className="w-6 h-6 text-kaivo-teal-neon" />
                            <h3 className="text-xl font-bold text-kaivo-text-primary">Describe Your Campaign</h3>
                        </div>

                        <p className="text-kaivo-text-secondary mb-4">
                            Tell Kaivo about your campaign goals, target audience, and any preferences. The AI will recommend platforms, targeting, and budget allocation.
                        </p>

                        <textarea
                            className="w-full min-h-[200px] p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary focus:outline-none focus:ring-2 focus:ring-kaivo-teal-neon"
                            placeholder="Example: I want to promote a luxury skincare brand to women aged 25-45 in major US cities. Target affluent demographics interested in beauty and wellness. Prefer platforms with high-quality content placements like CTV and premium social."
                            value={aiPrompt}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAiPrompt(e.target.value)}
                        />

                        <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                            <p className="text-sm text-blue-900 dark:text-blue-200">
                                <strong>AI will optimize:</strong> Platform selection across all 13 channels, geographic and demographic targeting, budget allocation, creative recommendations, and bidding strategies.
                            </p>
                        </div>
                    </Card>

                    {/* Creative Assets */}
                    <Card className="p-6">
                        <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary">Creative Assets</h3>

                        {!cloudinaryUrl ? (
                            <FileUploadZone
                                onUpload={(result: CloudinaryUploadResult) => {
                                    setCloudinaryUrl(result.secure_url);
                                    if (result.resource_type === 'image') setFileType('image');
                                    else if (result.resource_type === 'video') setFileType('video');
                                }}
                                folder="creative"
                                maxFileSize={100000000}
                                allowedFormats={['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov']}
                                description="Drop your video or image here"
                            />
                        ) : (
                            <UploadedFilePreview
                                url={cloudinaryUrl}
                                fileType={fileType}
                                onRemove={() => {
                                    setCloudinaryUrl(null);
                                    setFileType(null);
                                }}
                            />
                        )}
                    </Card>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <button className={cn(buttonVariants({ variant: "outline" }), "flex-1")} onClick={() => setMode(null)}>
                            Cancel
                        </button>
                        <button
                            className={cn(buttonVariants({ variant: "primary" }), "flex-1")}
                            onClick={handleAICampaignSubmit}
                            disabled={generating}
                        >
                            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Generate Campaign with AI
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Manual Mode - Comprehensive Builder
    return (
        <div className="max-w-6xl mx-auto py-12 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-4xl font-bold mb-2 text-kaivo-text-primary">Manual Campaign Builder</h1>
                    <p className="text-kaivo-text-secondary">Configure every aspect of your campaign</p>
                </div>
                <button className={cn(buttonVariants({ variant: "ghost" }))} onClick={() => setMode(null)}>
                    Change Mode
                </button>
            </div>

            {/* Client Selector */}
            <ClientSelector />

            <div className="space-y-6">
                {/* Campaign Details */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Campaign Details
                    </h3>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="name">Campaign Name*</Label>
                            <Input
                                id="name"
                                placeholder="e.g., Q1 Brand Awareness"
                                value={campaignName}
                                onChange={(e) => setCampaignName(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="objective">Campaign Objective*</Label>
                            <select
                                id="objective"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                value={objective}
                                onChange={(e) => setObjective(e.target.value)}
                            >
                                <option value="awareness">Brand Awareness</option>
                                <option value="traffic">Traffic</option>
                                <option value="conversion">Conversions</option>
                                <option value="app_installs">App Installs</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="start-date">Start Date*</Label>
                            <Input id="start-date" type="date" />
                        </div>
                        <div>
                            <Label htmlFor="end-date">End Date</Label>
                            <Input id="end-date" type="date" />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Pre-made audience</Label>
                            <select
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                value={selectedAudienceId}
                                onChange={(e) => setSelectedAudienceId(e.target.value === '' ? '' : Number(e.target.value))}
                                disabled={audiencesLoading}
                            >
                                <option value="">None (use demographics only)</option>
                                {audiences.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-kaivo-text-muted mt-1">Optional: Reuse an audience you created under Audiences to skip manual targeting.</p>
                        </div>
                    </div>
                </Card>

                {/* Budget */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Budget Configuration
                    </h3>

                    <div className="grid md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="total-budget">Total Budget (USD)*</Label>
                            <Input
                                id="total-budget"
                                type="text"
                                placeholder="10000"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="daily-budget">Daily Budget (USD)</Label>
                            <Input id="daily-budget" type="number" placeholder="333" disabled />
                        </div>
                        <div>
                            <Label htmlFor="bid-strategy">Bidding Strategy</Label>
                            <select className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary">
                                <option>Auto (Kaivo Optimized)</option>
                                <option>Target CPM</option>
                                <option>Target CPC</option>
                                <option>Target CPA</option>
                            </select>
                        </div>
                    </div>
                </Card>

                {/* Platform Selection */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <Target className="w-5 h-5" />
                        Platform Selection
                    </h3>

                    {CATEGORIES.map((category) => (
                        <div key={category} className="mb-6 last:mb-0">
                            <h4 className="font-semibold text-kaivo-text-secondary mb-3 capitalize">
                                {category.replace('_', ' ')}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {PLATFORM_DEFS.filter(p => p.category === category).map(platform => (
                                    <label
                                        key={platform.id}
                                        className={cn(
                                            "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                                            selectedPlatforms.includes(platform.id)
                                                ? "border-kaivo-teal-neon bg-kaivo-teal-neon/5"
                                                : "border-gray-300 dark:border-gray-700 hover:border-kaivo-teal-neon"
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            className="rounded"
                                            checked={selectedPlatforms.includes(platform.id)}
                                            onChange={() => handlePlatformToggle(platform.id)}
                                        />
                                        <span className="text-sm text-kaivo-text-primary">{platform.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </Card>

                {/* Meta Ad Account Selection (shown when Facebook/Meta is selected) */}
                {(selectedPlatforms.includes('facebook') || selectedPlatforms.includes('meta')) && (
                    <Card className="p-6">
                        <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                            <Target className="w-5 h-5" />
                            Meta Ads Account
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="ad-account-select">Meta Ads Account</Label>
                                <select
                                    id="ad-account-select"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary disabled:opacity-50"
                                    value={selectedAdAccount}
                                    onChange={(e) => setSelectedAdAccount(e.target.value)}
                                    disabled={adAccountsLoading}
                                >
                                    <option value="">
                                        {adAccountsLoading ? 'Loading ad accounts...' : 'Select an ad account...'}
                                    </option>
                                    {adAccounts.map(account => (
                                        <option key={account.id} value={account.id}>
                                            {account.name} (ID: {account.account_id})
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-kaivo-text-muted">
                                        Choose the Meta ad account to run your campaign on
                                    </p>
                                    <button
                                        type="button"
                                        onClick={refreshAdAccounts}
                                        disabled={adAccountsLoading}
                                        className="text-xs text-kaivo-teal-neon hover:text-kaivo-teal-neon/80 disabled:opacity-50 flex items-center gap-1"
                                        title="Refresh ad accounts"
                                    >
                                        <Loader2 className={`w-3 h-3 ${adAccountsLoading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </button>
                                </div>
                                {adAccountsLoading && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Connecting to Meta Ads API...
                                    </p>
                                )}
                            </div>

                            {adAccountsError && (
                                <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="font-medium">Meta Ads Connection Error</p>
                                            <p className="mt-1">{adAccountsError}</p>
                                            {adAccountsError.includes('token') && (
                                                <p className="mt-2 text-xs">
                                                    💡 Try reconnecting your Meta account or check the access token in backend .env
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!adAccountsError && adAccounts.length > 0 && (
                                <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-sm">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        <div>
                                            <p className="font-medium">Successfully connected to Meta Ads!</p>
                                            <p className="text-xs opacity-90 mt-1">
                                                Found {adAccounts.length} ad account(s) using configured access token
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedAdAccount && (
                                <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 text-sm">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>
                                            Selected: <strong>{adAccounts.find(acc => acc.id === selectedAdAccount)?.name}</strong>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Spotify Ad Account Selection (shown when Spotify is selected) */}
                {selectedPlatforms.includes('spotify') && (
                    <Card className="p-6">
                        <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                            <Target className="w-5 h-5" />
                            Spotify Ads Account
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="spotify-ad-account-select">Spotify Ads Account</Label>
                                <select
                                    id="spotify-ad-account-select"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary disabled:opacity-50"
                                    value={selectedSpotifyAdAccount}
                                    onChange={(e) => setSelectedSpotifyAdAccount(e.target.value)}
                                    disabled={spotifyAdAccountsLoading}
                                >
                                    <option value="">
                                        {spotifyAdAccountsLoading ? 'Loading ad accounts...' : 'Select a Spotify ad account...'}
                                    </option>
                                    {spotifyAdAccounts.map(account => (
                                        <option key={account.id} value={account.id}>
                                            {account.name} (ID: {account.account_id})
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-kaivo-text-muted">
                                        Choose the Spotify ad account to run your campaign on
                                    </p>
                                    <button
                                        type="button"
                                        onClick={refreshSpotifyAdAccounts}
                                        disabled={spotifyAdAccountsLoading}
                                        className="text-xs text-kaivo-teal-neon hover:text-kaivo-teal-neon/80 disabled:opacity-50 flex items-center gap-1"
                                        title="Refresh ad accounts"
                                    >
                                        <Loader2 className={`w-3 h-3 ${spotifyAdAccountsLoading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </button>
                                </div>
                                {spotifyAdAccountsLoading && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Connecting to Spotify Ads API...
                                    </p>
                                )}
                            </div>

                            {spotifyAdAccountsError && (
                                <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="font-medium">Spotify Ads Connection Error</p>
                                            <p className="mt-1">{spotifyAdAccountsError}</p>
                                            {spotifyAdAccountsError.includes('token') && (
                                                <p className="mt-2 text-xs">
                                                    Try reconnecting your Spotify account on the Integrations page.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!spotifyAdAccountsError && spotifyAdAccounts.length > 0 && (
                                <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-sm">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        <div>
                                            <p className="font-medium">Successfully connected to Spotify Ads!</p>
                                            <p className="text-xs opacity-90 mt-1">
                                                Found {spotifyAdAccounts.length} ad account(s)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedSpotifyAdAccount && (
                                <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 text-sm">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>
                                            Selected: <strong>{spotifyAdAccounts.find(acc => acc.id === selectedSpotifyAdAccount)?.name}</strong>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Google Ads Connection Status (shown when Google Ads is selected) */}
                {selectedPlatforms.includes('google_ads') && googleAdsAccountInfo && (
                    <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-sm">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            <div>
                                <p className="font-medium">Successfully connected to Google Ads!</p>
                                <p className="text-xs opacity-90 mt-1">
                                    Account: <strong>{googleAdsAccountInfo.name}</strong> (ID: {googleAdsAccountInfo.id})
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Geographic Targeting */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        Geographic Targeting
                    </h3>

                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Countries – searchable */}
                        <div className="relative">
                            <Label>Countries</Label>
                            <div className="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card">
                                {geography.countries.map(c => (
                                    <span key={`sel-c-${c}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs">
                                        {c}
                                        <button onClick={() => setGeography(prev => ({ ...prev, countries: prev.countries.filter(x => x !== c) }))} className="hover:text-white">&times;</button>
                                    </span>
                                ))}
                                <input
                                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-kaivo-text-primary placeholder:text-kaivo-text-muted"
                                    placeholder={geography.countries.length === 0 ? "Search countries..." : "Add more..."}
                                    value={countrySearch}
                                    onChange={(e) => { setCountrySearch(e.target.value); setShowCountryDropdown(true); }}
                                    onFocus={() => setShowCountryDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowCountryDropdown(false), 200)}
                                />
                            </div>
                            {showCountryDropdown && (
                                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card shadow-lg">
                                    {COUNTRIES.filter(c => !geography.countries.includes(c) && c.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                                        <button
                                            key={c}
                                            className="w-full text-left px-3 py-2 text-sm text-kaivo-text-primary hover:bg-kaivo-teal-neon/10 transition-colors"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setGeography(prev => ({ ...prev, countries: [...prev.countries, c] }));
                                                setCountrySearch('');
                                            }}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                    {COUNTRIES.filter(c => !geography.countries.includes(c) && c.toLowerCase().includes(countrySearch.toLowerCase())).length === 0 && (
                                        <div className="px-3 py-2 text-sm text-kaivo-text-muted">No matches</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* States – searchable */}
                        <div className="relative">
                            <Label>States / Provinces</Label>
                            <div className="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card">
                                {geography.states.map(s => (
                                    <span key={`sel-s-${s}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs">
                                        {s}
                                        <button onClick={() => setGeography(prev => ({ ...prev, states: prev.states.filter(x => x !== s) }))} className="hover:text-white">&times;</button>
                                    </span>
                                ))}
                                <input
                                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-kaivo-text-primary placeholder:text-kaivo-text-muted"
                                    placeholder={geography.states.length === 0 ? "Search states..." : "Add more..."}
                                    value={stateSearch}
                                    onChange={(e) => { setStateSearch(e.target.value); setShowStateDropdown(true); }}
                                    onFocus={() => setShowStateDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowStateDropdown(false), 200)}
                                />
                            </div>
                            {showStateDropdown && (
                                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card shadow-lg">
                                    {US_STATES.filter(s => !geography.states.includes(s) && s.toLowerCase().includes(stateSearch.toLowerCase())).map(s => (
                                        <button
                                            key={s}
                                            className="w-full text-left px-3 py-2 text-sm text-kaivo-text-primary hover:bg-kaivo-teal-neon/10 transition-colors"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setGeography(prev => ({ ...prev, states: [...prev.states, s] }));
                                                setStateSearch('');
                                            }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                    {US_STATES.filter(s => !geography.states.includes(s) && s.toLowerCase().includes(stateSearch.toLowerCase())).length === 0 && (
                                        <div className="px-3 py-2 text-sm text-kaivo-text-muted">No matches</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Cities / Zip Codes */}
                        <div>
                            <Label>Cities / Zip Codes</Label>
                            <Input
                                placeholder="e.g., Los Angeles, 90210, New York, 10001"
                                value={geography.cities.join(', ')}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const val = e.target.value;
                                    const cities = val.split(',').map((c: string) => c.trim());
                                    setGeography({ ...geography, cities: cities });
                                }}
                            />
                            <p className="text-xs text-kaivo-text-muted mt-1">Enter comma-separated values</p>

                            <div className="mt-4 pt-4 border-t border-white/5">
                                <Label className="text-xs uppercase text-kaivo-text-muted mb-2 block">Quick Add via Zip Code</Label>
                                <ZipCodeInput
                                    onLocationFound={(city, state, zip) => {
                                        if (!geography.zipcodes.includes(zip)) {
                                            setGeography(prev => ({ ...prev, zipcodes: [...prev.zipcodes, zip] }));
                                        }
                                        const locationString = `${city}, ${state}`;
                                        if (!geography.cities.includes(locationString)) {
                                            setGeography(prev => ({ ...prev, cities: [...prev.cities, locationString] }));
                                        }
                                        if (!geography.states.includes(state)) {
                                            setGeography(prev => ({ ...prev, states: [...prev.states, state] }));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* DMAs */}
                        <div>
                            <Label>DMAs (Designated Market Areas)</Label>
                            <Input
                                placeholder="e.g., 501 (New York)"
                                value={geography.dmas.join(', ')}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const val = e.target.value;
                                    setGeography({ ...geography, dmas: val.split(',').map((s: string) => s.trim()) });
                                }}
                            />
                        </div>
                    </div>

                    {/* Target Languages – searchable (130+ languages) */}
                    <div className="mt-6 pt-6 border-t border-white/10">
                        <Label className="mb-2 block">Target Languages</Label>
                        <div className="relative">
                            <div className="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card">
                                {targetingLanguages.map(code => {
                                    const langName = LANGUAGES.find(l => l.code === code)?.name || code;
                                    return (
                                        <span key={`tl-${code}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs">
                                            {langName}
                                            <button onClick={() => setTargetingLanguages(prev => prev.filter(x => x !== code))} className="hover:text-white">&times;</button>
                                        </span>
                                    );
                                })}
                                <input
                                    className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-kaivo-text-primary placeholder:text-kaivo-text-muted"
                                    placeholder={targetingLanguages.length === 0 ? "Search from 130+ languages..." : "Add more..."}
                                    value={langTargetSearch}
                                    onChange={(e) => { setLangTargetSearch(e.target.value); setShowLangTargetDropdown(true); }}
                                    onFocus={() => setShowLangTargetDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowLangTargetDropdown(false), 200)}
                                />
                            </div>
                            {showLangTargetDropdown && (
                                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card shadow-lg">
                                    {LANGUAGES.filter(l => !targetingLanguages.includes(l.code) && (l.name.toLowerCase().includes(langTargetSearch.toLowerCase()) || l.code.toLowerCase().includes(langTargetSearch.toLowerCase()))).map(l => (
                                        <button
                                            key={l.code}
                                            className="w-full text-left px-3 py-2 text-sm text-kaivo-text-primary hover:bg-kaivo-teal-neon/10 transition-colors"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setTargetingLanguages(prev => [...prev, l.code]);
                                                setLangTargetSearch('');
                                            }}
                                        >
                                            {l.name} <span className="text-kaivo-text-muted">({l.code.toUpperCase()})</span>
                                        </button>
                                    ))}
                                    {LANGUAGES.filter(l => !targetingLanguages.includes(l.code) && (l.name.toLowerCase().includes(langTargetSearch.toLowerCase()) || l.code.toLowerCase().includes(langTargetSearch.toLowerCase()))).length === 0 && (
                                        <div className="px-3 py-2 text-sm text-kaivo-text-muted">No matches</div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Geo-based language recommendations */}
                        {geoRecommendations.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                <span className="text-xs text-kaivo-text-muted self-center">Suggested:</span>
                                {geoRecommendations.filter(r => !targetingLanguages.includes(r.code)).map(rec => (
                                    <button
                                        key={rec.code}
                                        className="px-2 py-1 bg-kaivo-teal-neon/10 text-kaivo-teal-neon text-xs rounded-full hover:bg-kaivo-teal-neon/20 border border-kaivo-teal-neon/30 transition-colors"
                                        onClick={() => setTargetingLanguages(prev => [...prev, rec.code])}
                                    >
                                        + {rec.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Targets Visualization */}
                    {(geography.countries.length > 0 || geography.states.length > 0 || geography.cities.length > 0 || geography.dmas.length > 0 || geography.zipcodes.length > 0) && (
                        <div className="mt-6 pt-6 border-t border-white/10">
                            <h4 className="text-sm font-semibold text-kaivo-text-secondary mb-3">Selected Geographic Targets</h4>
                            <div className="flex flex-wrap gap-2">
                                {geography.countries.map(c => (
                                    <span key={`country-${c}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-sm">
                                        {c}
                                        <button
                                            onClick={() => setGeography(prev => ({ ...prev, countries: prev.countries.filter(x => x !== c) }))}
                                            className="hover:text-white transition-colors"
                                        >
                                            <span className="sr-only">Remove</span>
                                            &times;
                                        </button>
                                    </span>
                                ))}
                                {geography.states.map(s => (
                                    <span key={`state-${s}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-sm">
                                        {s}
                                        <button
                                            onClick={() => setGeography(prev => ({ ...prev, states: prev.states.filter(x => x !== s) }))}
                                            className="hover:text-white transition-colors"
                                        >
                                            <span className="sr-only">Remove</span>
                                            &times;
                                        </button>
                                    </span>
                                ))}
                                {geography.cities.filter(Boolean).map(c => (
                                    <span key={`city-${c}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full text-sm">
                                        {c}
                                        <button
                                            onClick={() => setGeography(prev => ({ ...prev, cities: prev.cities.filter(x => x !== c) }))}
                                            className="hover:text-white transition-colors"
                                        >
                                            <span className="sr-only">Remove</span>
                                            &times;
                                        </button>
                                    </span>
                                ))}
                                {geography.zipcodes.map(z => (
                                    <span key={`zip-${z}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-full text-sm">
                                        {z}
                                        <button
                                            onClick={() => setGeography(prev => ({ ...prev, zipcodes: prev.zipcodes.filter(x => x !== z) }))}
                                            className="hover:text-white transition-colors"
                                        >
                                            <span className="sr-only">Remove</span>
                                            &times;
                                        </button>
                                    </span>
                                ))}
                                {geography.dmas.filter(Boolean).map(d => (
                                    <span key={`dma-${d}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-sm">
                                        {d}
                                        <button
                                            onClick={() => setGeography(prev => ({ ...prev, dmas: prev.dmas.filter(x => x !== d) }))}
                                            className="hover:text-white transition-colors"
                                        >
                                            <span className="sr-only">Remove</span>
                                            &times;
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Product Knowledge & AI Generation */}
                <Card className="p-6 border-kaivo-teal-neon/30">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Product Knowledge & Creative AI
                    </h3>

                    <div className="space-y-4">
                        {/* Product Documents Selector */}
                        <div>
                            <Label>Select Product Documents</Label>
                            <div className="mt-2 p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
                                <p className="text-sm text-kaivo-text-muted text-center py-4">
                                    Document listing not available yet.
                                </p>
                            </div>
                        </div>

                        {/* Product Brief */}
                        <div>
                            <Label>Product Brief</Label>
                            <textarea
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary resize-none"
                                rows={3}
                                placeholder="What are you promoting in this campaign? E.g., Summer sale for luxury skincare products..."
                                value={productBrief}
                                onChange={(e) => setProductBrief(e.target.value)}
                            />
                        </div>

                        {/* Generate Button */}
                        <div className="flex justify-center pt-2">
                            <button
                                onClick={() => handleGenerateVariants(false)}
                                disabled={generating || !productBrief}
                                className={cn(buttonVariants(), "bg-gradient-to-r from-kaivo-teal-neon to-kaivo-teal-glow text-black font-semibold px-8 py-2 hover:opacity-90")}
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Generating with AI...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Generate Creative Variants
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Generated Variants Display */}
                        {generatedVariants && (
                            <div className="mt-6 space-y-4 p-4 bg-kaivo-teal-neon/5 border border-kaivo-teal-neon/30 rounded-lg">
                                <div className="flex items-center gap-2 text-kaivo-teal-neon font-semibold">
                                    <CheckCircle className="w-5 h-5" />
                                    AI-Generated Variants
                                </div>

                                {/* Headlines */}
                                {generatedVariants.headline_short && generatedVariants.headline_short.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-kaivo-text-primary mb-2">Short Headlines (30 chars)</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {generatedVariants.headline_short.slice(0, 6).map((variant: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="p-3 bg-white dark:bg-card border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-kaivo-teal-neon transition-colors"
                                                    onClick={() => {
                                                        if (!selectedHeadlines.includes(variant.text)) {
                                                            setSelectedHeadlines([...selectedHeadlines, variant.text]);
                                                        }
                                                    }}
                                                >
                                                    <div className="text-sm font-medium text-kaivo-text-primary">{variant.text}</div>
                                                    <div className="text-xs text-kaivo-text-muted mt-1">{variant.tone} • {(variant.score * 100).toFixed(0)}%</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Body Copy */}
                                {generatedVariants.body && generatedVariants.body.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-kaivo-text-primary mb-2">Body Copy (270 chars)</h4>
                                        <div className="space-y-2">
                                            {generatedVariants.body.slice(0, 3).map((variant: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="p-3 bg-white dark:bg-card border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-kaivo-teal-neon transition-colors"
                                                    onClick={() => {
                                                        if (!selectedBodyCopy.includes(variant.text)) {
                                                            setSelectedBodyCopy([...selectedBodyCopy, variant.text]);
                                                        }
                                                    }}
                                                >
                                                    <div className="text-sm text-kaivo-text-primary">{variant.text}</div>
                                                    <div className="text-xs text-kaivo-text-muted mt-1">{variant.rationale}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Keywords - if returned by AI */}
                                {generatedVariants.keywords && generatedVariants.keywords.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-kaivo-text-primary mb-2">Keywords</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {generatedVariants.keywords.slice(0, 10).map((kw: any, i: number) => {
                                                const keywordText = typeof kw === 'string' ? kw : (kw?.text || String(kw));
                                                return (
                                                <span
                                                    key={i}
                                                    className="px-3 py-1 bg-kaivo-teal-neon/10 text-kaivo-teal-neon text-sm rounded-full cursor-pointer hover:bg-kaivo-teal-neon/20"
                                                    onClick={() => {
                                                        if (!selectedKeywords.includes(keywordText)) {
                                                            setSelectedKeywords([...selectedKeywords, keywordText]);
                                                        }
                                                    }}
                                                >
                                                    {keywordText}
                                                </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Selected Creative Summary */}
                        {(selectedHeadlines.length > 0 || selectedBodyCopy.length > 0 || selectedKeywords.length > 0) && (
                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Selected Creative</h4>
                                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                                    {selectedHeadlines.length > 0 && <div>• {selectedHeadlines.length} headlines selected</div>}
                                    {selectedBodyCopy.length > 0 && <div>• {selectedBodyCopy.length} body copy variants selected</div>}
                                    {selectedKeywords.length > 0 && <div>• {selectedKeywords.length} keywords selected</div>}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Shopify store connect section intentionally commented out */}
                {/*
                <Card className="p-6 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <Store className="w-5 h-5" />
                        Shopify Product Selection (Optional)
                    </h3>
                    <div className="space-y-4">
                    </div>
                </Card>
                */}

                {/* Demographics */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Demographics & Audience
                    </h3>

                    <div className="space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                            <div>
                                <Label>Age Range*</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Min"
                                        value={demographics.ageMin}
                                        onChange={(e) => setDemographics(prev => ({ ...prev, ageMin: e.target.value }))}
                                    />
                                    <Input
                                        type="number"
                                        placeholder="Max"
                                        value={demographics.ageMax}
                                        onChange={(e) => setDemographics(prev => ({ ...prev, ageMax: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Gender</Label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                    value={demographics.gender}
                                    onChange={(e) => setDemographics(prev => ({ ...prev, gender: e.target.value }))}
                                >
                                    <option>All</option>
                                    <option>Male</option>
                                    <option>Female</option>
                                </select>
                            </div>
                            <div>
                                <Label>Household Income</Label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                    value={demographics.income}
                                    onChange={(e) => setDemographics(prev => ({ ...prev, income: e.target.value }))}
                                >
                                    <option>All Incomes</option>
                                    <option>$0-$50k</option>
                                    <option>$50k-$100k</option>
                                    <option>$100k-$150k</option>
                                    <option>$150k+</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <Label>Interests & Topics</Label>
                            <div className="flex flex-wrap gap-1.5 p-2 min-h-[42px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card">
                                {interests.map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs">
                                        {tag}
                                        <button onClick={() => setInterests(prev => prev.filter(t => t !== tag))} className="hover:text-white">&times;</button>
                                    </span>
                                ))}
                                <input
                                    className="flex-1 min-w-[160px] bg-transparent outline-none text-sm text-kaivo-text-primary placeholder:text-kaivo-text-muted"
                                    placeholder={interests.length === 0 ? "e.g., fitness, luxury travel, technology" : "Add more..."}
                                    value={interestInput}
                                    onChange={(e) => setInterestInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if ((e.key === 'Enter' || e.key === ',') && interestInput.trim()) {
                                            e.preventDefault();
                                            const newTags = interestInput.split(',').map(t => t.trim()).filter(t => t && !interests.includes(t));
                                            if (newTags.length > 0) setInterests(prev => [...prev, ...newTags]);
                                            setInterestInput('');
                                        }
                                        if (e.key === 'Backspace' && !interestInput && interests.length > 0) {
                                            setInterests(prev => prev.slice(0, -1));
                                        }
                                    }}
                                    onBlur={() => {
                                        if (interestInput.trim()) {
                                            const newTags = interestInput.split(',').map(t => t.trim()).filter(t => t && !interests.includes(t));
                                            if (newTags.length > 0) setInterests(prev => [...prev, ...newTags]);
                                            setInterestInput('');
                                        }
                                    }}
                                />
                            </div>
                            <p className="text-xs text-kaivo-text-muted mt-1">Type and press Enter or comma to add interests</p>
                        </div>

                        <div>
                            <Label>Custom Audiences</Label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-300 dark:border-gray-700">
                                    <input type="checkbox" className="rounded" />
                                    <span className="text-sm text-kaivo-text-primary">Website Visitors (30 days)</span>
                                </label>
                                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-300 dark:border-gray-700">
                                    <input type="checkbox" className="rounded" />
                                    <span className="text-sm text-kaivo-text-primary">Purchasers (180 days)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Device Targeting */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary">Device Targeting</h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {['Desktop', 'Mobile', 'Tablet', 'Connected TV'].map(device => (
                            <label
                                key={device}
                                className="flex items-center gap-2 p-3 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer"
                            >
                                <input type="checkbox" className="rounded" defaultChecked />
                                <span className="text-sm text-kaivo-text-primary">{device}</span>
                            </label>
                        ))}
                    </div>
                </Card>

                {/* Creative Assets */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary">Creative Assets</h3>

                    {!cloudinaryUrl ? (
                        <FileUploadZone
                            onUpload={(result: CloudinaryUploadResult) => {
                                setCloudinaryUrl(result.secure_url);
                                if (result.resource_type === 'image') setFileType('image');
                                else if (result.resource_type === 'video') {
                                    if (['mp3', 'wav', 'ogg', 'aac'].includes(result.format)) {
                                        setFileType('audio');
                                    } else {
                                        setFileType('video');
                                    }
                                }
                            }}
                            folder="creative"
                            accept="image/*,video/*,audio/*"
                            maxFileSize={100000000}
                            allowedFormats={['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav']}
                            description="Click to Upload"
                        />
                    ) : (
                        <UploadedFilePreview
                            url={cloudinaryUrl}
                            fileType={fileType}
                            onRemove={() => {
                                setCloudinaryUrl(null);
                                setFileType(null);
                            }}
                        />
                    )}

                    <div className="mt-4 grid md:grid-cols-2 gap-4">
                        <div>
                            <Label>Headline*</Label>
                            <Input
                                placeholder="Enter your main headline"
                                value={primaryHeadline}
                                onChange={(e) => setPrimaryHeadline(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Ad Copy*</Label>
                            <Input
                                placeholder="Enter your ad copy"
                                value={primaryBody}
                                onChange={(e) => setPrimaryBody(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={() => handleGenerateVariants(false)}
                            disabled={generating}
                            className={cn(buttonVariants({ variant: "ghost" }), "text-kaivo-teal-neon hover:text-kaivo-teal-glow hover:bg-kaivo-teal-neon/10")}
                        >
                            {generating ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Zap className="w-4 h-4 mr-2" />
                            )}
                            Get AI Recommendations
                        </button>
                    </div>

                    {generatedVariants && !mode && (
                        <div className="mt-6 p-4 bg-kaivo-teal-neon/5 border border-kaivo-teal-neon/30 rounded-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-lg text-kaivo-text-primary flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-kaivo-teal-neon" />
                                    Recommended for You
                                </h4>
                                <button
                                    onClick={() => handleGenerateVariants(true)}
                                    className="text-xs text-kaivo-text-muted hover:text-white underline"
                                >
                                    Regenerate
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Headlines */}
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <h5 className="text-sm font-semibold text-kaivo-text-secondary mb-2">Short Headlines</h5>
                                        <div className="space-y-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {generatedVariants.headline_short?.map((v, i) => (
                                                <div
                                                    key={i}
                                                    className="p-2 bg-white dark:bg-card border border-gray-600 rounded cursor-pointer hover:border-kaivo-teal-neon hover:bg-kaivo-teal-neon/10 transition-colors group"
                                                    onClick={() => setPrimaryHeadline(v.text)}
                                                >
                                                    <div className="text-sm text-kaivo-text-primary group-hover:text-white">{v.text}</div>
                                                    <div className="text-xs text-gray-500 mt-1 flex justify-between">
                                                        <span>{v.tone}</span>
                                                        <span>{(v.score * 100).toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-semibold text-kaivo-text-secondary mb-2">Long Headlines</h5>
                                        <div className="space-y-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {generatedVariants.headline_long?.map((v, i) => (
                                                <div
                                                    key={i}
                                                    className="p-2 bg-white dark:bg-card border border-gray-600 rounded cursor-pointer hover:border-kaivo-teal-neon hover:bg-kaivo-teal-neon/10 transition-colors group"
                                                    onClick={() => setPrimaryHeadline(v.text)}
                                                >
                                                    <div className="text-sm text-kaivo-text-primary group-hover:text-white">{v.text}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Body & Keywords */}
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <h5 className="text-sm font-semibold text-kaivo-text-secondary mb-2">Ad Copy</h5>
                                        <div className="space-y-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {generatedVariants.body?.map((v, i) => (
                                                <div
                                                    key={i}
                                                    className="p-2 bg-white dark:bg-card border border-gray-600 rounded cursor-pointer hover:border-kaivo-teal-neon hover:bg-kaivo-teal-neon/10 transition-colors group"
                                                    onClick={() => setPrimaryBody(v.text)}
                                                >
                                                    <div className="text-sm text-kaivo-text-primary group-hover:text-white line-clamp-3">{v.text}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{v.rationale}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-semibold text-kaivo-text-secondary mb-2">Keywords & CTAs</h5>
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                {generatedVariants.keywords?.map((k: any, i: number) => {
                                                    const keywordText = typeof k === 'string' ? k : (k?.text || String(k));
                                                    return (
                                                    <span key={i} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded border border-blue-500/20">
                                                        {keywordText}
                                                    </span>
                                                    );
                                                })}
                                            </div>
                                            <div className="pt-2 border-t border-white/10">
                                                <h6 className="text-xs font-semibold text-kaivo-text-muted mb-2">Recommended CTAs</h6>
                                                <div className="flex flex-wrap gap-2">
                                                    {generatedVariants.cta?.map((c, i) => (
                                                        <span key={i} className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded border border-green-500/20">{c.text}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Translation & Localization */}
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-kaivo-text-primary flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Translation & Localization
                    </h3>

                    <div className="space-y-4">


                        {/* Source Language */}
                        <div>
                            <Label>Source Language</Label>
                            <div className="flex gap-2">
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                    value={sourceLanguage}
                                    onChange={(e) => setSourceLanguage(e.target.value)}
                                >
                                    <option value="auto">Auto-Detect</option>
                                    {LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>
                                            {lang.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Target Languages */}
                        <div>
                            <Label>Target Languages</Label>

                            {/* Geo Recommendations */}
                            {geoRecommendations.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    <span className="text-xs text-kaivo-text-muted self-center">Recommended for your audience:</span>
                                    {geoRecommendations.map(rec => (
                                        <button
                                            key={rec.code}
                                            className="px-2 py-1 bg-kaivo-teal-neon/10 text-kaivo-teal-neon text-xs rounded-full hover:bg-kaivo-teal-neon/20 border border-kaivo-teal-neon/30 transition-colors"
                                            onClick={() => {
                                                if (!targetLanguages.includes(rec.code)) {
                                                    setTargetLanguages([...targetLanguages, rec.code]);
                                                }
                                            }}
                                        >
                                            + {rec.name}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 flex-wrap mb-2">
                                {targetLanguages.map(langCode => {
                                    const langName = LANGUAGES.find(l => l.code === langCode)?.name || langCode;
                                    return (
                                        <span key={langCode} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-sm">
                                            {langName}
                                            <button
                                                onClick={() => setTargetLanguages(targetLanguages.filter(t => t !== langCode))}
                                                className="hover:text-white transition-colors"
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>

                            <select
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-card text-kaivo-text-primary"
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val && !targetLanguages.includes(val)) {
                                        setTargetLanguages([...targetLanguages, val]);
                                    }
                                    e.target.value = ""; // Reset
                                }}
                            >
                                <option value="">Add a language...</option>
                                {LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.name} ({lang.code.toUpperCase()})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
                        >
                            {isTranslating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Translating & Naturalizing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Translate Campaign Assets
                                </>
                            )}
                        </button>
                    </div>

                    {/* Translation Results */}
                    {translatedVariants && (
                        <div className="mt-6 space-y-6">
                            {Object.keys(translatedVariants).map(lang => (
                                <div key={lang} className="p-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <h4 className="font-bold text-lg text-kaivo-text-primary mb-3 flex items-center gap-2">
                                        <span className="uppercase px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">{lang}</span>
                                        Localized Creative
                                    </h4>

                                    {Object.keys(translatedVariants[lang]).map(type => (
                                        <div key={type} className="mb-4 last:mb-0">
                                            <h5 className="text-sm font-semibold text-kaivo-text-muted uppercase mb-2">{type}</h5>
                                            <div className="space-y-3">
                                                {translatedVariants[lang][type].map((item: any, idx: number) => (
                                                    <div key={idx} className="p-3 bg-white dark:bg-card border border-gray-200 dark:border-gray-700 rounded text-sm group hover:border-kaivo-teal-neon transition-colors">
                                                        <div className="font-medium text-kaivo-text-primary mb-1">{item.naturalized_text}</div>
                                                        <div className="text-xs text-gray-500 italic mb-2">Original: {item.original}</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-white/5 p-2 rounded">
                                                            <div><span className="font-semibold">Tone:</span> {item.tone}</div>
                                                            <div><span className="font-semibold">Rationale:</span> {item.rationale}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Submit */}
                <div className="flex gap-4">
                    <button className={cn(buttonVariants({ variant: "outline" }), "flex-1")} onClick={() => setMode(null)}>
                        Cancel
                    </button>
                    <button className={cn(buttonVariants({ variant: "primary" }), "flex-1")} onClick={handleCreateCampaign}>
                        Create Campaign
                    </button>
                </div>
            </div>

            {/* Shopify Connect Modal */}
            {showShopifyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShopifyModal(false)}>
                    <div className="bg-white dark:bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                <Store className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-kaivo-text-primary">Connect Shopify Store</h3>
                                <p className="text-sm text-kaivo-text-muted">Enter your store domain to connect</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="modal-shop-domain">Store Domain</Label>
                                <Input
                                    id="modal-shop-domain"
                                    placeholder="your-store.myshopify.com"
                                    value={modalShopDomain}
                                    onChange={(e) => setModalShopDomain(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleConnectFromModal();
                                        }
                                    }}
                                    autoFocus
                                />
                                <p className="text-xs text-kaivo-text-muted mt-1">
                                    Example: kaivo-dev.myshopify.com
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowShopifyModal(false)}
                                    className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConnectFromModal}
                                    disabled={!modalShopDomain.trim()}
                                    className={cn(buttonVariants({ variant: "default" }), "flex-1")}
                                >
                                    <Store className="w-4 h-4 mr-2" />
                                    Connect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Shopify Disconnect Modal */}
            {showDisconnectModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !disconnectingShopify && setShowDisconnectModal(false)}>
                    <div className="bg-white dark:bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                                <Store className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-kaivo-text-primary">Disconnect Shopify Store</h3>
                                <p className="text-sm text-kaivo-text-muted">This will remove the saved access token.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="p-3 rounded-lg border border-border bg-gray-50 dark:bg-black/20">
                                <p className="text-sm text-kaivo-text-primary font-medium">Store</p>
                                <p className="text-sm text-kaivo-text-muted">{shopifyShopDomain}</p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDisconnectModal(false)}
                                    disabled={disconnectingShopify}
                                    className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDisconnectShopifyStore}
                                    disabled={disconnectingShopify}
                                    className={cn(buttonVariants({ variant: "danger" }), "flex-1")}
                                >
                                    {disconnectingShopify ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Disconnecting...
                                        </>
                                    ) : (
                                        "Disconnect"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function NewCampaignPage() {
    return (
        <Suspense fallback={
            <div className="max-w-4xl mx-auto py-12 px-4">
                <div className="h-32 bg-white/5 rounded-lg animate-pulse" />
            </div>
        }>
            <NewCampaignPageContent />
        </Suspense>
    );
}
