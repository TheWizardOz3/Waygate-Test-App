'use client';

import { useState, useCallback, useEffect } from 'react';
import { useScrapedPages, scrapedPageKeys } from '@/hooks';
import { useScrapeJob, useScrapeJobStatus } from '@/hooks/useScrapeJob';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink, AlertCircle, Plus, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface IntegrationDocumentationTabProps {
  integrationId: string;
  integration?: IntegrationResponse;
}

export function IntegrationDocumentationTab({
  integrationId,
  integration,
}: IntegrationDocumentationTabProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useScrapedPages(integrationId);
  const { startScraping, isPending: isStarting } = useScrapeJob();

  // Ad-hoc scrape state
  const [showAddForm, setShowAddForm] = useState(false);
  const [urlInputs, setUrlInputs] = useState<string[]>(['']);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Poll the active scrape job
  const { data: jobStatus } = useScrapeJobStatus(activeJobId, {
    enabled: !!activeJobId,
  });

  // When job completes, refresh the page list and reset form
  useEffect(() => {
    if (!jobStatus || !activeJobId) return;

    if (jobStatus.status === 'COMPLETED') {
      toast.success('Pages scraped successfully', {
        description: `Scrape job completed. Documentation pages have been updated.`,
      });
      queryClient.invalidateQueries({ queryKey: scrapedPageKeys.list(integrationId) });
      setActiveJobId(null);
      setShowAddForm(false);
      setUrlInputs(['']);
    } else if (jobStatus.status === 'FAILED') {
      toast.error('Scrape failed', {
        description: 'The scrape job failed. Please try again.',
      });
      setActiveJobId(null);
    }
  }, [jobStatus, activeJobId, integrationId, queryClient]);

  const addUrlInput = useCallback(() => {
    setUrlInputs((prev) => [...prev, '']);
  }, []);

  const removeUrlInput = useCallback((index: number) => {
    setUrlInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateUrlInput = useCallback((index: number, value: string) => {
    setUrlInputs((prev) => prev.map((url, i) => (i === index ? value : url)));
  }, []);

  const handleScrape = useCallback(async () => {
    const validUrls = urlInputs
      .map((u) => u.trim())
      .filter((u) => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      });

    if (validUrls.length === 0) {
      toast.error('No valid URLs', { description: 'Please enter at least one valid URL.' });
      return;
    }

    try {
      const result = await startScraping({
        specificUrls: validUrls,
        documentationUrl: integration?.documentationUrl ?? undefined,
        wishlist: [],
      });
      setActiveJobId(result.jobId);
      toast.info('Scrape started', {
        description: `Scraping ${validUrls.length} page${validUrls.length !== 1 ? 's' : ''}...`,
      });
    } catch {
      // Error toast handled by useScrapeJob hook
    }
  }, [urlInputs, startScraping, integration?.documentationUrl]);

  const isScraping = isStarting || !!activeJobId;

  if (isLoading) {
    return <DocumentationSkeleton />;
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Failed to load documentation pages</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  let hostnameDisplay: string | null = null;
  if (data?.documentationUrl) {
    try {
      hostnameDisplay = new URL(data.documentationUrl).hostname;
    } catch {
      // ignore invalid URL
    }
  }

  const hasPages = data?.pages && data.pages.length > 0;

  return (
    <div className="space-y-4">
      {/* Summary + Add Pages button */}
      <div className="flex items-center justify-between">
        {hasPages ? (
          <p className="text-sm text-muted-foreground">
            {data.pages.length} page{data.pages.length !== 1 ? 's' : ''} scraped
            {hostnameDisplay && (
              <>
                {' '}
                from{' '}
                <a
                  href={data.documentationUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {hostnameDisplay}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {integration?.documentationUrl
              ? 'No documentation pages scraped yet.'
              : 'Add a documentation URL to this integration, or scrape pages directly.'}
          </p>
        )}
        <div className="flex items-center gap-2">
          {hasPages && (
            <Badge variant="outline">
              {data.totalJobs} scrape job{data.totalJobs !== 1 ? 's' : ''}
            </Badge>
          )}
          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={isScraping}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Pages
            </Button>
          )}
        </div>
      </div>

      {/* Add Pages form */}
      {showAddForm && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">Add documentation pages to scrape</p>
              {urlInputs.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="https://api.example.com/docs/endpoints"
                    value={url}
                    onChange={(e) => updateUrlInput(index, e.target.value)}
                    disabled={isScraping}
                  />
                  {urlInputs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removeUrlInput(index)}
                      disabled={isScraping}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addUrlInput}
                  disabled={isScraping || urlInputs.length >= 20}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add another URL
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setUrlInputs(['']);
                    }}
                    disabled={isScraping}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleScrape} disabled={isScraping}>
                    {isScraping ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Scraping...
                      </>
                    ) : (
                      'Scrape'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pages table */}
      {hasPages && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page URL</TableHead>
                <TableHead className="w-48 text-right">Last Scraped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pages.map((page) => (
                <TableRow key={page.url}>
                  <TableCell>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <span className="truncate">{page.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    <span title={format(new Date(page.lastScrapedAt), 'PPpp')}>
                      {formatDistanceToNow(new Date(page.lastScrapedAt), { addSuffix: true })}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function DocumentationSkeleton() {
  return (
    <Card>
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-96" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
    </Card>
  );
}
