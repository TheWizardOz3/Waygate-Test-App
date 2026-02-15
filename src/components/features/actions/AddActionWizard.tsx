'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  PenLine,
  Search,
  ArrowRight,
  Check,
  Loader2,
  Globe,
  Star,
  ChevronLeft,
  Plus,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  useCachedActions,
  useCreateAction,
  useIntegration,
  useDiscoverActions,
  useScrapedPages,
  actionKeys,
} from '@/hooks';
import { useScrapeJobStatus } from '@/hooks/useScrapeJob';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface AddActionWizardProps {
  integrationId: string;
}

// Method badge colors
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PUT: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  PATCH: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
};

type WizardStep =
  | 'choose-method'
  | 'discover-input'
  | 'discovering'
  | 'select-actions'
  | 'creating';

export function AddActionWizard({ integrationId }: AddActionWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('choose-method');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());

  // Wishlist state
  const [wishlistInput, setWishlistInput] = useState('');
  const [wishlistItems, setWishlistItems] = useState<string[]>([]);
  const [discoveryJobId, setDiscoveryJobId] = useState<string | null>(null);

  // Specific URLs state
  const [specificUrlInput, setSpecificUrlInput] = useState('');
  const [specificUrls, setSpecificUrls] = useState<string[]>([]);
  const [showScrapedPages, setShowScrapedPages] = useState(false);

  const { data: integration } = useIntegration(integrationId);
  const {
    data: cachedData,
    isLoading: isCachedLoading,
    refetch: refetchCached,
  } = useCachedActions(integrationId);
  const { data: scrapedPagesData } = useScrapedPages(integrationId);
  const createAction = useCreateAction();
  const discoverActions = useDiscoverActions();

  // Poll job status when discovering
  const { data: jobData } = useScrapeJobStatus(discoveryJobId, {
    enabled: step === 'discovering' && !!discoveryJobId,
  });

  // Handle job completion
  useEffect(() => {
    if (jobData?.status === 'COMPLETED') {
      // Refetch cached actions to get the merged results
      refetchCached().then(() => {
        setStep('select-actions');
        setDiscoveryJobId(null);
      });
    } else if (jobData?.status === 'FAILED') {
      setStep('discover-input');
      setDiscoveryJobId(null);
    }
  }, [jobData?.status, refetchCached]);

  // Filter actions by search query and exclude already added
  const availableActions = useMemo(() => {
    const actions = cachedData?.actions ?? [];
    const notAdded = actions.filter((a) => !a.alreadyAdded);

    if (!searchQuery.trim()) return notAdded;

    const query = searchQuery.toLowerCase();
    return notAdded.filter(
      (action) =>
        action.name.toLowerCase().includes(query) ||
        action.path.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query)
    );
  }, [cachedData?.actions, searchQuery]);

  const alreadyAddedCount = cachedData?.actions.filter((a) => a.alreadyAdded).length ?? 0;
  const totalCachedCount = cachedData?.actions.length ?? 0;
  const hasDocUrl = !!integration?.documentationUrl;
  const hasCachedActions = totalCachedCount > 0;

  const addWishlistItem = useCallback(() => {
    const trimmed = wishlistInput.trim();
    if (trimmed && !wishlistItems.includes(trimmed)) {
      setWishlistItems((prev) => [...prev, trimmed]);
      setWishlistInput('');
    }
  }, [wishlistInput, wishlistItems]);

  const removeWishlistItem = (item: string) => {
    setWishlistItems((prev) => prev.filter((i) => i !== item));
  };

  const addSpecificUrl = useCallback(() => {
    const trimmed = specificUrlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed); // Validate it's a URL
      if (!specificUrls.includes(trimmed)) {
        setSpecificUrls((prev) => [...prev, trimmed]);
        setSpecificUrlInput('');
      }
    } catch {
      // Invalid URL - do nothing (input stays for user to fix)
    }
  }, [specificUrlInput, specificUrls]);

  const removeSpecificUrl = (url: string) => {
    setSpecificUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleStartDiscovery = async () => {
    if (wishlistItems.length === 0) return;

    try {
      const result = await discoverActions.mutateAsync({
        integrationId,
        wishlist: wishlistItems,
        specificUrls: specificUrls.length > 0 ? specificUrls : undefined,
      });
      setDiscoveryJobId(result.jobId);
      setStep('discovering');
    } catch {
      // Error handled by hook
    }
  };

  const handleToggleAction = (slug: string) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedActions.size === availableActions.length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(availableActions.map((a) => a.slug)));
    }
  };

  const handleAddSelectedActions = async () => {
    if (selectedActions.size === 0) return;

    setStep('creating');

    const actionsToAdd = availableActions.filter((a) => selectedActions.has(a.slug));

    // Create actions sequentially
    for (const action of actionsToAdd) {
      try {
        await createAction.mutateAsync({
          integrationId,
          name: action.name,
          slug: action.slug,
          description: action.description,
          httpMethod: action.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          endpointTemplate: action.path,
          inputSchema: action.parameters
            ? {
                type: 'object' as const,
                properties: action.parameters.reduce<Record<string, { type: string }>>(
                  (acc, param) => {
                    if (typeof param === 'object' && param !== null && 'name' in param) {
                      acc[(param as { name: string }).name] = {
                        type: 'string',
                      };
                    }
                    return acc;
                  },
                  {}
                ),
              }
            : { type: 'object' as const },
          outputSchema: (action.responseSchema as { type: 'object' }) ?? {
            type: 'object' as const,
          },
          cacheable: false,
          tags: [],
          metadata: {
            aiConfidence: 0.8,
          },
        });
      } catch {
        // Error is handled by the hook
      }
    }

    // Invalidate cached actions
    queryClient.invalidateQueries({ queryKey: actionKeys.cached(integrationId) });

    // Navigate back to actions list
    router.push(`/integrations/${integrationId}`);
  };

  // Render choose method step
  if (step === 'choose-method') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/integrations/${integrationId}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Add Action</h1>
            <p className="text-sm text-muted-foreground">
              Choose how you want to add a new action to {integration?.name}
            </p>
          </div>
        </div>

        {/* Option cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* AI-assisted option */}
          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-secondary hover:shadow-md',
              !hasDocUrl && 'cursor-not-allowed opacity-50'
            )}
            onClick={() => {
              if (hasDocUrl) {
                // If we have cached actions, go to select; otherwise go to discover input
                if (hasCachedActions && totalCachedCount - alreadyAddedCount > 0) {
                  setStep('select-actions');
                } else {
                  setStep('discover-input');
                }
              }
            }}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/20">
                  <Sparkles className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <CardTitle className="text-lg">AI-Powered Discovery</CardTitle>
                  {hasCachedActions ? (
                    <Badge variant="secondary" className="mt-1">
                      {totalCachedCount - alreadyAddedCount} available
                    </Badge>
                  ) : hasDocUrl ? (
                    <Badge variant="outline" className="mt-1">
                      Describe what you need
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1">
                      No docs URL
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                {hasCachedActions && totalCachedCount - alreadyAddedCount > 0
                  ? `Select from ${totalCachedCount - alreadyAddedCount} discovered actions, or describe new actions to find.`
                  : hasDocUrl
                    ? 'Describe what actions you need and AI will extract them from the API documentation.'
                    : 'No documentation URL configured for this integration.'}
              </CardDescription>
              {hasDocUrl && (
                <Button variant="ghost" className="mt-4 w-full">
                  {hasCachedActions && totalCachedCount - alreadyAddedCount > 0
                    ? 'Select Actions'
                    : 'Discover Actions'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Manual creation option */}
          <Card className="cursor-pointer transition-all hover:border-secondary hover:shadow-md">
            <Link href={`/integrations/${integrationId}/actions/new/manual`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <PenLine className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Create Manually</CardTitle>
                    <Badge variant="outline" className="mt-1">
                      Full control
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Define the action manually by specifying the HTTP method, endpoint, parameters,
                  and response schema.
                </CardDescription>
                <Button variant="ghost" className="mt-4 w-full">
                  Create Action
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  // Render discover input step (wishlist input)
  if (step === 'discover-input') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep('choose-method')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Discover Actions</h1>
            <p className="text-sm text-muted-foreground">
              Describe what actions you want to find for {integration?.name}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-secondary" />
              Action Wishlist
            </CardTitle>
            <CardDescription>
              Enter the actions or capabilities you&apos;re looking for. AI will search the API
              documentation and extract matching endpoints. This adds to existing discovered
              actions. Each run analyzes up to 20 of the most relevant pages — for large APIs, you
              can run discovery multiple times or provide specific documentation URLs below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Wishlist input */}
            <div className="flex gap-2">
              <Input
                value={wishlistInput}
                onChange={(e) => setWishlistInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addWishlistItem();
                  }
                }}
                placeholder="e.g., send message, list users, create order..."
                className="flex-1"
              />
              <Button variant="outline" onClick={addWishlistItem} disabled={!wishlistInput.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Wishlist items */}
            {wishlistItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {wishlistItems.map((item) => (
                  <Badge key={item} variant="secondary" className="gap-1 pl-3">
                    {item}
                    <button
                      type="button"
                      onClick={() => removeWishlistItem(item)}
                      className="ml-1 rounded-full p-0.5 hover:bg-secondary-foreground/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Example suggestions */}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Example wishlist items:
              </p>
              <div className="flex flex-wrap gap-1">
                {['send message', 'list users', 'get order', 'create invoice', 'upload file'].map(
                  (example) => (
                    <Badge
                      key={example}
                      variant="outline"
                      className="cursor-pointer text-xs hover:bg-secondary/20"
                      onClick={() => {
                        if (!wishlistItems.includes(example)) {
                          setWishlistItems((prev) => [...prev, example]);
                        }
                      }}
                    >
                      {example}
                    </Badge>
                  )
                )}
              </div>
            </div>

            {/* Previously Scraped Pages - collapsible */}
            {scrapedPagesData && scrapedPagesData.pages.length > 0 && (
              <div className="rounded-lg border border-border/50">
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowScrapedPages(!showScrapedPages)}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Previously Scraped Pages ({scrapedPagesData.pages.length})
                  </span>
                  {showScrapedPages ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showScrapedPages && (
                  <div className="border-t border-border/50 px-3 pb-3">
                    <p className="mb-2 pt-2 text-xs text-muted-foreground">
                      These pages have been analyzed previously. To search new areas, add specific
                      URLs below.
                    </p>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {scrapedPagesData.pages.map((page) => (
                        <a
                          key={page.url}
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-primary hover:underline"
                        >
                          {page.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Specific Documentation URLs (optional) */}
            <div className="rounded-lg border border-border/50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                Specific Documentation URLs (optional)
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                If you know which documentation pages contain the actions you need, paste them here.
                This scrapes those pages directly instead of searching the whole site.
              </p>
              <div className="flex gap-2">
                <Input
                  value={specificUrlInput}
                  onChange={(e) => setSpecificUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSpecificUrl();
                    }
                  }}
                  placeholder="https://api.slack.com/methods/emoji.list"
                  className="flex-1 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSpecificUrl}
                  disabled={!specificUrlInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {specificUrls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {specificUrls.map((url) => (
                    <div
                      key={url}
                      className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1"
                    >
                      <span className="flex-1 truncate font-mono text-xs">{url}</span>
                      <button
                        type="button"
                        onClick={() => removeSpecificUrl(url)}
                        className="rounded-full p-0.5 hover:bg-destructive/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Existing cached count info */}
            {hasCachedActions && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span>
                  {totalCachedCount} actions already discovered • New discoveries will be added to
                  this list
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('choose-method')}>
            Back
          </Button>
          <div className="flex gap-2">
            {hasCachedActions && totalCachedCount - alreadyAddedCount > 0 && (
              <Button variant="outline" onClick={() => setStep('select-actions')}>
                View Existing ({totalCachedCount - alreadyAddedCount})
              </Button>
            )}
            <Button
              onClick={handleStartDiscovery}
              disabled={wishlistItems.length === 0 || discoverActions.isPending}
            >
              {discoverActions.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Discover Actions
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Handle cancel discovery
  const handleCancelDiscovery = () => {
    setDiscoveryJobId(null);
    setStep('discover-input');
  };

  // Render discovering step (progress)
  if (step === 'discovering') {
    const progress = jobData?.progress ?? 0;
    const status = jobData?.status ?? 'PENDING';
    const progressDetails = jobData?.progressDetails as
      | {
          stage?: string;
          message?: string;
          apiName?: string;
          pagesFound?: number;
          pagesSelected?: number;
          pagesScraped?: number;
          endpointsFound?: number;
          isLargeApi?: boolean;
        }
      | undefined;

    // Determine step statuses
    const getStepStatus = (stepName: string): 'pending' | 'active' | 'completed' => {
      const stages: Record<string, number> = {
        triage: 1,
        scraping: 2,
        parsing: 3,
        generating: 4,
      };
      const currentStageNum = stages[progressDetails?.stage ?? ''] ?? 0;
      const stepNum = stages[stepName] ?? 0;

      if (status === 'COMPLETED') return 'completed';
      if (status === 'FAILED') return currentStageNum >= stepNum ? 'completed' : 'pending';
      if (currentStageNum > stepNum) return 'completed';
      if (currentStageNum === stepNum) return 'active';
      return 'pending';
    };

    const crawlStatus =
      getStepStatus('triage') === 'completed' || getStepStatus('scraping') !== 'pending'
        ? status === 'CRAWLING'
          ? 'active'
          : getStepStatus('scraping')
        : 'pending';
    const parseStatus = getStepStatus('parsing');
    const generateStatus = getStepStatus('generating');

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/20">
            <Sparkles className="h-5 w-5 animate-pulse text-secondary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Discovering Actions</h1>
            <p className="text-sm text-muted-foreground">
              AI is searching for: {wishlistItems.join(', ')}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="py-6">
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {progressDetails?.message || 'Starting discovery...'}
                  </span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* API Info */}
              {progressDetails?.apiName && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{progressDetails.apiName}</span>
                  {progressDetails.isLargeApi && (
                    <Badge variant="outline" className="text-xs">
                      Large API
                    </Badge>
                  )}
                </div>
              )}

              {/* Step-by-step progress */}
              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                {/* Step 1: Crawling */}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      crawlStatus === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-600'
                        : crawlStatus === 'active'
                          ? 'bg-secondary/20 text-secondary'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {crawlStatus === 'completed' ? (
                      <Check className="h-3 w-3" />
                    ) : crawlStatus === 'active' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      '1'
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        crawlStatus === 'active' && 'text-secondary'
                      )}
                    >
                      Crawling Documentation
                    </p>
                    {(crawlStatus === 'active' || crawlStatus === 'completed') && (
                      <p className="text-xs text-muted-foreground">
                        {progressDetails?.pagesFound !== undefined &&
                          `Found ${progressDetails.pagesFound} pages`}
                        {progressDetails?.pagesSelected !== undefined &&
                          ` • Selected ${progressDetails.pagesSelected}`}
                        {progressDetails?.pagesScraped !== undefined &&
                          ` • Scraped ${progressDetails.pagesScraped}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 2: Parsing */}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      parseStatus === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-600'
                        : parseStatus === 'active'
                          ? 'bg-secondary/20 text-secondary'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {parseStatus === 'completed' ? (
                      <Check className="h-3 w-3" />
                    ) : parseStatus === 'active' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      '2'
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        parseStatus === 'active' && 'text-secondary'
                      )}
                    >
                      Parsing API Specification
                    </p>
                    {parseStatus === 'active' && (
                      <p className="text-xs text-muted-foreground">
                        Extracting endpoints with AI...
                        {progressDetails?.endpointsFound !== undefined &&
                          ` Found ${progressDetails.endpointsFound} so far`}
                      </p>
                    )}
                    {parseStatus === 'completed' &&
                      progressDetails?.endpointsFound !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Found {progressDetails.endpointsFound} endpoints
                        </p>
                      )}
                  </div>
                </div>

                {/* Step 3: Generating */}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      generateStatus === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-600'
                        : generateStatus === 'active'
                          ? 'bg-secondary/20 text-secondary'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {generateStatus === 'completed' ? (
                      <Check className="h-3 w-3" />
                    ) : generateStatus === 'active' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      '3'
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        generateStatus === 'active' && 'text-secondary'
                      )}
                    >
                      Generating Actions
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                This may take a few minutes for large APIs.
              </p>

              {/* Cancel button */}
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={handleCancelDiscovery}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel Discovery
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render select actions step
  if (step === 'select-actions') {
    if (isCachedLoading) {
      return <AddActionWizardSkeleton />;
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep('choose-method')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Select Actions</h1>
            <p className="text-sm text-muted-foreground">
              Choose actions to add from {totalCachedCount - alreadyAddedCount} available
            </p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search actions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedActions.size === availableActions.length ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Deselect All
                </>
              ) : (
                'Select All'
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStep('discover-input')}>
              <Sparkles className="mr-2 h-4 w-4" />
              Discover More
            </Button>
          </div>
        </div>

        {/* Action list */}
        <ScrollArea className="h-[400px] rounded-lg border border-border/50 p-2">
          <div className="space-y-2">
            {availableActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                {searchQuery ? (
                  <>
                    <Search className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No actions match your search</p>
                  </>
                ) : (
                  <>
                    <Globe className="mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      All discovered actions have been added
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => setStep('discover-input')}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Discover New Actions
                    </Button>
                  </>
                )}
              </div>
            ) : (
              availableActions.map((action) => (
                <div
                  key={action.slug}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                    selectedActions.has(action.slug)
                      ? 'border-secondary/50 bg-secondary/5'
                      : 'border-border/50 bg-background'
                  )}
                  onClick={() => handleToggleAction(action.slug)}
                >
                  <Checkbox
                    checked={selectedActions.has(action.slug)}
                    className="mt-1"
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => handleToggleAction(action.slug)}
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">{action.name}</span>
                      <Badge
                        variant="outline"
                        className={cn('font-mono text-xs uppercase', METHOD_COLORS[action.method])}
                      >
                        {action.method}
                      </Badge>
                    </div>

                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {action.path}
                    </p>

                    {action.description && (
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {action.description}
                      </p>
                    )}
                  </div>

                  {/* AI confidence indicator */}
                  <div className="flex shrink-0 items-center gap-1" title="AI Confidence">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Discovery hint */}
        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t see what you need? Click &quot;Discover More&quot; to search additional pages
          with a new wishlist, or provide specific documentation URLs for targeted discovery.
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedActions.size} of {availableActions.length} actions selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('choose-method')}>
              Back
            </Button>
            <Button onClick={handleAddSelectedActions} disabled={selectedActions.size === 0}>
              Add {selectedActions.size} Action{selectedActions.size !== 1 && 's'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render creating step
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      <p className="mt-4 text-lg font-medium">Adding Actions...</p>
      <p className="text-sm text-muted-foreground">
        Creating {selectedActions.size} action{selectedActions.size !== 1 && 's'}
      </p>
    </div>
  );
}

function AddActionWizardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-10 max-w-sm flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-2 rounded-lg border p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-12 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
