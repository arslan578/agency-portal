'use client';

import { CampaignWizardState } from '@/hooks/useCampaignWizard';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';

interface Step3GeographyProps {
  state: CampaignWizardState;
  updateState: (updates: Partial<CampaignWizardState>) => void;
}

export function Step3Geography({ state, updateState }: Step3GeographyProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Geographic Targeting</h2>
        <p className="text-gray-400">Define where your campaign will be shown.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Countries</Label>
          <p className="text-xs text-gray-400 mt-1">Geographic targeting will be configured here</p>
        </div>
        <div>
          <Label>Zip Codes</Label>
          <Input
            value={state.geography.zipcodes.join(', ')}
            onChange={(e) => {
              const zipcodes = e.target.value.split(',').map(z => z.trim()).filter(Boolean);
              updateState({ geography: { ...state.geography, zipcodes } });
            }}
            placeholder="e.g., 10001, 10002, 10003"
          />
        </div>
      </div>
    </div>
  );
}
