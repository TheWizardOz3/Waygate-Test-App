'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Play,
  PlusCircle,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWizardStore } from '@/stores/wizard.store';
import Confetti from 'react-confetti';
import { useState, useEffect } from 'react';

export function StepSuccess() {
  const router = useRouter();
  const { data, reset } = useWizardStore();
  const [showConfetti, setShowConfetti] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Get window size for confetti
  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });

    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleViewIntegration = () => {
    const integrationId = data.createdIntegrationId;
    reset();
    router.push(`/integrations/${integrationId}`);
  };

  const handleTestAction = () => {
    const integrationId = data.createdIntegrationId;
    reset();
    router.push(`/integrations/${integrationId}/actions`);
  };

  const handleCreateAnother = () => {
    reset();
    // Stay on the page - wizard will reset to step 1
  };

  return (
    <>
      {/* Confetti animation */}
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
          colors={['#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899']}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 100 }}
        />
      )}

      <div className="space-y-6 py-4 text-center">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle2 className="h-10 w-10 text-accent" />
            </div>
          </div>
        </div>

        {/* Success message */}
        <div className="space-y-2">
          <h3 className="font-heading text-2xl font-bold text-foreground">Integration Created!</h3>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{data.createdIntegrationName}</span> is
            ready to use.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-4">
          <Badge variant="secondary" className="gap-1 px-3 py-1.5">
            <Zap className="h-3.5 w-3.5" />
            {data.selectedActionCount} Actions Ready
          </Badge>
          <Badge variant="outline" className="gap-1 px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Generated
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={handleViewIntegration} size="lg" className="w-full">
            View Integration
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleTestAction} className="gap-2">
              <Play className="h-4 w-4" />
              Test an Action
            </Button>
            <Button variant="outline" onClick={handleCreateAnother} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Create Another
            </Button>
          </div>
        </div>

        {/* Next steps */}
        <div className="mt-6 rounded-lg border border-border/50 bg-muted/30 p-4 text-left">
          <h4 className="mb-3 text-sm font-medium">What&apos;s Next?</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="rounded bg-secondary/10 px-1.5 py-0.5 font-mono text-xs text-secondary">
                1
              </span>
              <span>Review and customize the AI-generated actions in the Actions tab</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="rounded bg-secondary/10 px-1.5 py-0.5 font-mono text-xs text-secondary">
                2
              </span>
              <span>Test actions with the built-in &quot;Try It&quot; feature</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="rounded bg-secondary/10 px-1.5 py-0.5 font-mono text-xs text-secondary">
                3
              </span>
              <span>Use your Waygate API key to invoke actions from your application</span>
            </li>
          </ul>

          <div className="mt-4 border-t border-border/50 pt-3">
            <Link
              href="/settings"
              className="inline-flex items-center text-sm text-secondary hover:underline"
            >
              Get your API Key
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
