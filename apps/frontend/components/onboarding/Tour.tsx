'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface TourStep {
  target: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface TourProps {
  steps: TourStep[];
  onComplete?: () => void;
  storageKey?: string;
}

export function Tour({ steps, onComplete, storageKey = 'kaivo_onboarding_tour' }: TourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(storageKey);
      if (!completed) {
        setIsVisible(true);
      }
    }
  }, [storageKey]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, 'completed');
    }
    if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible || currentStep >= steps.length) return null;

  const step = steps[currentStep];
  const targetElement = document.querySelector(step.target);

  if (!targetElement) {
    return null;
  }

  const rect = targetElement.getBoundingClientRect();
  const position = step.position || 'bottom';

  const getPositionStyles = () => {
    switch (position) {
      case 'top':
        return { bottom: window.innerHeight - rect.top + 10, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
      case 'bottom':
        return { top: rect.bottom + 10, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
      case 'left':
        return { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + 10, transform: 'translateY(-50%)' };
      case 'right':
        return { top: rect.top + rect.height / 2, left: rect.right + 10, transform: 'translateY(-50%)' };
      default:
        return { top: rect.bottom + 10, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
      <div
        className="fixed z-50 w-80"
        style={getPositionStyles()}
      >
        <Card className="border-primary/50 bg-card shadow-2xl">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-white mb-1">{step.title}</h3>
                <p className="text-sm text-gray-400">{step.content}</p>
              </div>
              <button
                onClick={handleComplete}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                Step {currentStep + 1} of {steps.length}
              </div>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button variant="outline" size="sm" onClick={handlePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" onClick={handleNext}>
                  {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                  {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
