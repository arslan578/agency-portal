'use client';

import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select';
import { CampaignWizardState } from '@/hooks/useCampaignWizard';

interface Step1BasicInfoProps {
  state: CampaignWizardState;
  updateState: (updates: Partial<CampaignWizardState>) => void;
}

export function Step1BasicInfo({ state, updateState }: Step1BasicInfoProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Basic Information</h2>
        <p className="text-gray-400">Let's start with the basics of your campaign.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="campaignName">Campaign Name</Label>
          <Input
            id="campaignName"
            value={state.campaignName}
            onChange={(e) => updateState({ campaignName: e.target.value })}
            placeholder="e.g., Summer Sale 2025"
            required
          />
        </div>

        <div>
          <Label htmlFor="objective">Campaign Objective</Label>
          <Select
            value={state.objective}
            onValueChange={(value) => updateState({ objective: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an objective" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="awareness">Awareness</SelectItem>
              <SelectItem value="traffic">Traffic</SelectItem>
              <SelectItem value="conversion">Conversion</SelectItem>
              <SelectItem value="engagement">Engagement</SelectItem>
              <SelectItem value="leads">Leads</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="budget">Total Budget (USD)</Label>
          <Input
            id="budget"
            type="number"
            value={state.budget}
            onChange={(e) => updateState({ budget: e.target.value })}
            placeholder="e.g., 10000"
            min="0"
            step="0.01"
            required
          />
          <p className="text-xs text-gray-400 mt-1">Enter your total campaign budget in USD</p>
        </div>
      </div>
    </div>
  );
}
