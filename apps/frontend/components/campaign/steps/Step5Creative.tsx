'use client';

import { CampaignWizardState } from '@/hooks/useCampaignWizard';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

interface Step5CreativeProps {
  state: CampaignWizardState;
  updateState: (updates: Partial<CampaignWizardState>) => void;
}

export function Step5Creative({ state, updateState }: Step5CreativeProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Creative Assets</h2>
        <p className="text-gray-400">Add your campaign creative content.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="headline">Primary Headline</Label>
          <Input
            id="headline"
            value={state.primaryHeadline}
            onChange={(e) => updateState({ primaryHeadline: e.target.value })}
            placeholder="Enter your headline"
          />
        </div>
        <div>
          <Label htmlFor="body">Body Copy</Label>
          <Textarea
            id="body"
            value={state.primaryBody}
            onChange={(e) => updateState({ primaryBody: e.target.value })}
            placeholder="Enter your body copy"
            rows={4}
          />
        </div>
        <div>
          <Label>Product Brief</Label>
          <Textarea
            value={state.productBrief}
            onChange={(e) => updateState({ productBrief: e.target.value })}
            placeholder="Describe your product or service"
            rows={6}
          />
        </div>
      </div>
    </div>
  );
}
