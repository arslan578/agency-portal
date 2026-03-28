'use client';

import React, { ReactNode, cloneElement, isValidElement } from 'react';
import { Button } from '@/components/ui/Button';
import { WizardProgress } from './WizardProgress';
import { useCampaignWizard } from '@/hooks/useCampaignWizard';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

interface CampaignWizardProps {
  children: ReactNode[];
  steps: string[];
  onComplete: (state: ReturnType<typeof useCampaignWizard>['state']) => Promise<void>;
  onSaveDraft?: (state: ReturnType<typeof useCampaignWizard>['state']) => void;
}

export function CampaignWizard({ children, steps, onComplete, onSaveDraft }: CampaignWizardProps) {
  const { currentStep, state, nextStep, previousStep, updateState } = useCampaignWizard();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleNext = () => {
    if (currentStep < children.length - 1) {
      nextStep();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      previousStep();
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await onComplete(state);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    if (onSaveDraft) {
      onSaveDraft(state);
    }
  };

  const isLastStep = currentStep === children.length - 1;
  const isFirstStep = currentStep === 0;

  const currentChild = React.Children.toArray(children)[currentStep];
  const childWithProps = isValidElement(currentChild)
    ? cloneElement(currentChild as React.ReactElement<any>, { state, updateState })
    : currentChild;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <WizardProgress currentStep={currentStep} totalSteps={steps.length} steps={steps} />
      
      <div className="mb-8">
        {childWithProps}
      </div>

      <div className="flex justify-between items-center pt-6 border-t border-white/10">
        <div>
          {onSaveDraft && (
            <Button variant="outline" onClick={handleSaveDraft}>
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          {!isFirstStep && (
            <Button variant="outline" onClick={handlePrevious}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
          {isLastStep ? (
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Campaign'}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
