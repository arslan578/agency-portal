'use client';

import { CampaignWizardState } from '@/hooks/useCampaignWizard';
import { Card } from '@/components/ui/Card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step2PlatformsProps {
  state: CampaignWizardState;
  updateState: (updates: Partial<CampaignWizardState>) => void;
}

const PLATFORMS = [
  { id: 'meta', label: 'Meta (Facebook/Instagram)', category: 'social_media' },
  { id: 'google_ads', label: 'Google Ads', category: 'display_search' },
  { id: 'tiktok', label: 'TikTok', category: 'social_media' },
  { id: 'youtube', label: 'YouTube', category: 'streaming_tv' },
  { id: 'snapchat', label: 'Snapchat', category: 'social_media' },
  { id: 'x', label: 'X (Twitter)', category: 'social_media' },
];

export function Step2Platforms({ state, updateState }: Step2PlatformsProps) {
  const togglePlatform = (platformId: string) => {
    if (state.selectedPlatforms.includes(platformId)) {
      updateState({ selectedPlatforms: state.selectedPlatforms.filter(p => p !== platformId) });
    } else {
      updateState({ selectedPlatforms: [...state.selectedPlatforms, platformId] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Select Platforms</h2>
        <p className="text-gray-400">Choose which advertising platforms to use for this campaign.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const isSelected = state.selectedPlatforms.includes(platform.id);
          return (
            <Card
              key={platform.id}
              className={cn(
                'p-6 cursor-pointer transition-all border-2',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-white/10 hover:border-white/20'
              )}
              onClick={() => togglePlatform(platform.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{platform.label}</h3>
                  <p className="text-sm text-gray-400 capitalize">{platform.category.replace('_', ' ')}</p>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-black" />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {state.selectedPlatforms.length === 0 && (
        <p className="text-sm text-yellow-400">Please select at least one platform to continue.</p>
      )}
    </div>
  );
}
