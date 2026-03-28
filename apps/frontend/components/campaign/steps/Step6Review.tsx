'use client';

import { CampaignWizardState } from '@/hooks/useCampaignWizard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface Step6ReviewProps {
  state: CampaignWizardState;
}

export function Step6Review({ state }: Step6ReviewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Review & Submit</h2>
        <p className="text-gray-400">Review your campaign details before creating.</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-gray-400">Name:</span>
              <p className="text-foreground font-medium">{state.campaignName || 'Not set'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Objective:</span>
              <p className="text-foreground font-medium capitalize">{state.objective || 'Not set'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Budget:</span>
              <p className="text-foreground font-medium">${state.budget || '0'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {state.selectedPlatforms.length > 0 ? (
                state.selectedPlatforms.map((platform) => (
                  <Badge key={platform} variant="default">
                    {platform}
                  </Badge>
                ))
              ) : (
                <p className="text-gray-400">No platforms selected</p>
              )}
            </div>
          </CardContent>
        </Card>

        {state.primaryHeadline && (
          <Card>
            <CardHeader>
              <CardTitle>Creative</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <span className="text-sm text-gray-400">Headline:</span>
                <p className="text-foreground">{state.primaryHeadline}</p>
              </div>
              {state.primaryBody && (
                <div>
                  <span className="text-sm text-gray-400">Body:</span>
                  <p className="text-foreground">{state.primaryBody}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
