'use client';

import { useEffect } from 'react';
import {
  Check,
  Loader2,
  AlertCircle,
  Globe,
  FileSearch,
  Cpu,
  Sparkles,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useWizardStore } from '@/stores/wizard.store';
import {
  useScrapeJobStatus,
  useReanalyzeScrapeJob,
  useCancelScrapeJob,
} from '@/hooks/useScrapeJob';
import { cn } from '@/lib/utils';

interface StepItemProps {
  icon: React.ReactNode;
  label: string;
  status: 'pending' | 'active' | 'completed';
  detail?: string;
}

function StepItem({ icon, label, status, detail }: StepItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
        status === 'pending' && 'border-border/50 bg-muted/30 text-muted-foreground',
        status === 'active' && 'border-secondary/50 bg-secondary/10',
        status === 'completed' && 'border-accent/50 bg-accent/10'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          status === 'pending' && 'bg-muted text-muted-foreground',
          status === 'active' && 'bg-secondary/20 text-secondary',
          status === 'completed' && 'bg-accent/20 text-accent'
        )}
      >
        {status === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === 'completed' ? (
          <Check className="h-4 w-4" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            status === 'active' && 'text-foreground',
            status === 'completed' && 'text-foreground'
          )}
        >
          {label}
        </p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export function StepScraping() {
  const {
    data,
    updateScrapeProgress,
    setDetectedActions,
    setDetectedAuthMethods,
    setDetectedApiInfo,
    setDetectedTemplate,
    goToStep,
    goBack,
  } = useWizardStore();

  const { data: jobData, isError, error } = useScrapeJobStatus(data.scrapeJobId);

  // Update wizard state when job status changes
  useEffect(() => {
    if (!jobData) return;

    updateScrapeProgress(jobData.progress, jobData.currentStep || '', jobData.status);

    // Handle completion
    if (jobData.status === 'COMPLETED' && 'result' in jobData) {
      const result = jobData.result;

      // Store detected data
      setDetectedApiInfo(result.name, result.baseUrl);
      setDetectedAuthMethods(result.authMethods);
      setDetectedActions(result.endpoints);

      // Store detected template if found
      if (result.metadata?.detectedTemplate) {
        setDetectedTemplate(result.metadata.detectedTemplate);
      }

      // Move to review step
      goToStep('review-actions');
    }
  }, [
    jobData,
    updateScrapeProgress,
    setDetectedApiInfo,
    setDetectedAuthMethods,
    setDetectedActions,
    setDetectedTemplate,
    goToStep,
  ]);

  // Derive step statuses from current status
  const getStepStatus = (
    step: 'crawling' | 'parsing' | 'generating'
  ): 'pending' | 'active' | 'completed' => {
    const statusOrder = ['PENDING', 'CRAWLING', 'PARSING', 'GENERATING', 'COMPLETED'];
    const currentIndex = statusOrder.indexOf(data.scrapeStatus || 'PENDING');
    const stepIndices = {
      crawling: 1,
      parsing: 2,
      generating: 3,
    };
    const stepIndex = stepIndices[step];

    if (currentIndex > stepIndex) return 'completed';
    if (currentIndex === stepIndex) return 'active';
    return 'pending';
  };

  const { reanalyze, isPending: isReanalyzing } = useReanalyzeScrapeJob();
  const { cancel, isPending: isCancelling } = useCancelScrapeJob();

  // Handle cancel
  const handleCancel = async () => {
    if (!data.scrapeJobId) return;
    try {
      await cancel(data.scrapeJobId);
      goBack(); // Go back to URL input step
    } catch {
      // Error is handled by the hook with toast
    }
  };

  // Handle re-analyze
  const handleReanalyze = async () => {
    if (!data.scrapeJobId) return;
    try {
      const result = await reanalyze(data.scrapeJobId);
      if (result.status === 'COMPLETED' && result.result) {
        // Re-fetch job status to get updated results
        // The query will auto-refetch and trigger the useEffect
      }
    } catch {
      // Error is handled by the hook with toast
    }
  };

  // Handle failed state
  if (isError || data.scrapeStatus === 'FAILED') {
    const errorDetails = jobData && 'error' in jobData ? jobData.error : null;
    const errorMessage = error?.message || errorDetails?.message || 'An unknown error occurred';
    const errorCode = errorDetails?.code || 'UNKNOWN_ERROR';
    const isRetryable = errorDetails?.retryable ?? false;

    // Determine if this is a rate limit or API key issue
    const isRateLimitError =
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.toLowerCase().includes('quota exceeded');
    const isApiKeyError =
      errorMessage.toLowerCase().includes('api key') ||
      errorMessage.toLowerCase().includes('leaked') ||
      errorMessage.toLowerCase().includes('unauthorized');

    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Scraping Failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{errorMessage}</p>
            {errorCode !== 'UNKNOWN_ERROR' && (
              <p className="text-xs opacity-75">Error code: {errorCode}</p>
            )}
          </AlertDescription>
        </Alert>

        {/* Helpful suggestions based on error type */}
        {isRateLimitError && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Rate Limited</AlertTitle>
            <AlertDescription>
              The AI service is temporarily rate limited. Wait a few minutes and try the
              &quot;Re-analyze&quot; button below to retry without re-scraping.
            </AlertDescription>
          </Alert>
        )}

        {isApiKeyError && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>API Key Issue</AlertTitle>
            <AlertDescription>
              There&apos;s an issue with the AI service API key. Please check your environment
              configuration and try again.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-3">
          {/* Re-analyze option - retries AI extraction on cached content */}
          {data.scrapeJobId && (isRetryable || isRateLimitError) && (
            <Button variant="outline" onClick={handleReanalyze} disabled={isReanalyzing}>
              {isReanalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-analyze
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => goBack()}>
            Try Different URL
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-mono text-foreground">{data.scrapeProgress}%</span>
        </div>
        <Progress value={data.scrapeProgress} className="h-2" />
        <p className="text-sm text-muted-foreground">{data.scrapeCurrentStep || 'Starting...'}</p>
      </div>

      {/* Step indicators */}
      <div className="space-y-3">
        <StepItem
          icon={<Globe className="h-4 w-4" />}
          label="Crawling Documentation"
          status={getStepStatus('crawling')}
          detail={
            getStepStatus('crawling') === 'active'
              ? `Scanning ${data.documentationUrl}`
              : getStepStatus('crawling') === 'completed'
                ? 'Pages discovered'
                : undefined
          }
        />
        <StepItem
          icon={<FileSearch className="h-4 w-4" />}
          label="Parsing API Specification"
          status={getStepStatus('parsing')}
          detail={
            getStepStatus('parsing') === 'active' ? 'Extracting endpoints and schemas' : undefined
          }
        />
        <StepItem
          icon={<Sparkles className="h-4 w-4" />}
          label="Generating Actions"
          status={getStepStatus('generating')}
          detail={
            getStepStatus('generating') === 'active'
              ? 'AI is creating action definitions'
              : undefined
          }
        />
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <Cpu className="mt-0.5 h-5 w-5 text-secondary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">AI-Powered Analysis</p>
            <p className="mt-1 text-muted-foreground">
              Our AI is reading the documentation, identifying authentication methods, and
              extracting API endpoints. This typically takes 30-60 seconds.
            </p>
          </div>
        </div>
      </div>

      {/* Cancel button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isCancelling}
          className="text-muted-foreground hover:text-destructive"
        >
          {isCancelling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cancelling...
            </>
          ) : (
            <>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
