'use client';

import { CampaignWizardState } from '@/hooks/useCampaignWizard';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';

interface Step4DemographicsProps {
  state: CampaignWizardState;
  updateState: (updates: Partial<CampaignWizardState>) => void;
}

export function Step4Demographics({ state, updateState }: Step4DemographicsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Demographics</h2>
        <p className="text-gray-400">Target specific audience demographics.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Age Range</Label>
          <Input
            placeholder="e.g., 25-45"
            value={state.demographics.age.join('-')}
            onChange={(e) => {
              const age = e.target.value.split('-').filter(Boolean);
              updateState({ demographics: { ...state.demographics, age } });
            }}
          />
        </div>
        <div>
          <Label>Gender</Label>
          <Input
            placeholder="e.g., all, male, female"
            value={state.demographics.gender}
            onChange={(e) => updateState({ demographics: { ...state.demographics, gender: e.target.value } })}
          />
        </div>
      </div>
    </div>
  );
}
