import { useState, useEffect } from 'react';

export interface CampaignWizardState {
  mode: 'ai' | 'manual' | null;
  campaignName: string;
  objective: string;
  budget: string;
  aiPrompt: string;
  selectedPlatforms: string[];
  geography: {
    countries: string[];
    states: string[];
    cities: string[];
    dmas: string[];
    zipcodes: string[];
  };
  demographics: {
    age: string[];
    gender: string;
    income: string[];
  };
  productBrief: string;
  primaryHeadline: string;
  primaryBody: string;
  file: File | null;
  filePreview: string | null;
  fileType: 'image' | 'video' | 'audio' | null;
  selectedHeadlines: string[];
  selectedBodyCopy: string[];
  selectedKeywords: string[];
  sourceLanguage: string;
  targetLanguages: string[];
  shopifyShopDomain: string;
  shopifyProductId: string;
  selectedAdAccount: string;
}

const DEFAULT_STATE: CampaignWizardState = {
  mode: null,
  campaignName: '',
  objective: '',
  budget: '',
  aiPrompt: '',
  selectedPlatforms: [],
  geography: { countries: [], states: [], cities: [], dmas: [], zipcodes: [] },
  demographics: { age: [], gender: '', income: [] },
  productBrief: '',
  primaryHeadline: '',
  primaryBody: '',
  file: null,
  filePreview: null,
  fileType: null,
  selectedHeadlines: [],
  selectedBodyCopy: [],
  selectedKeywords: [],
  sourceLanguage: 'auto',
  targetLanguages: [],
  shopifyShopDomain: '',
  shopifyProductId: '',
  selectedAdAccount: '',
};

const STORAGE_KEY = 'kaivo_campaign_wizard_draft';

export function useCampaignWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<CampaignWizardState>(() => {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_STATE, ...JSON.parse(saved) } : DEFAULT_STATE;
    } catch {
      return DEFAULT_STATE;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const updateState = (updates: Partial<CampaignWizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const resetState = () => {
    setState(DEFAULT_STATE);
    setCurrentStep(0);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const nextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const previousStep = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  return {
    currentStep,
    state,
    updateState,
    resetState,
    nextStep,
    previousStep,
    goToStep,
  };
}
