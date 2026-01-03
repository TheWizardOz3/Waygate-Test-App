'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Globe,
  Sparkles,
  Plus,
  X,
  ArrowRight,
  Loader2,
  FileText,
  Search,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useWizardStore } from '@/stores/wizard.store';
import { useScrapeJob } from '@/hooks/useScrapeJob';

type ScrapeMode = 'auto' | 'specific';

const urlInputSchema = z.object({
  documentationUrl: z.string().optional(),
  specificUrlsText: z.string().optional(),
  wishlistInput: z.string().optional(),
});

type UrlInputFormData = z.infer<typeof urlInputSchema>;

export function StepUrlInput() {
  const [scrapeMode, setScrapeMode] = useState<ScrapeMode>('auto');
  const [wishlistItems, setWishlistItems] = useState<string[]>([]);
  const [forceFresh, setForceFresh] = useState(false);
  const { setDocumentationUrl, setWishlist, setScrapeJob, goToStep } = useWizardStore();
  const { startScraping, isPending } = useScrapeJob();

  const form = useForm<UrlInputFormData>({
    resolver: zodResolver(urlInputSchema),
    defaultValues: {
      documentationUrl: '',
      specificUrlsText: '',
      wishlistInput: '',
    },
  });

  const addWishlistItem = () => {
    const input = form.getValues('wishlistInput')?.trim();
    if (input && !wishlistItems.includes(input)) {
      setWishlistItems([...wishlistItems, input]);
      form.setValue('wishlistInput', '');
    }
  };

  const removeWishlistItem = (item: string) => {
    setWishlistItems(wishlistItems.filter((i) => i !== item));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWishlistItem();
    }
  };

  const onSubmit = async (data: UrlInputFormData) => {
    // Parse specific URLs if in specific mode
    const specificUrls =
      scrapeMode === 'specific' && data.specificUrlsText
        ? data.specificUrlsText
            .split('\n')
            .map((url) => url.trim())
            .filter((url) => url.length > 0 && url.startsWith('http'))
        : undefined;

    // Validate input based on mode
    if (scrapeMode === 'auto' && !data.documentationUrl) {
      form.setError('documentationUrl', { message: 'Documentation URL is required' });
      return;
    }
    if (scrapeMode === 'specific' && (!specificUrls || specificUrls.length === 0)) {
      form.setError('specificUrlsText', { message: 'At least one valid URL is required' });
      return;
    }

    // Store form data in wizard state
    const primaryUrl = scrapeMode === 'auto' ? data.documentationUrl! : specificUrls![0];
    setDocumentationUrl(primaryUrl);
    setWishlist(wishlistItems);

    try {
      // Start the scraping job
      const result = await startScraping(
        {
          documentationUrl: scrapeMode === 'auto' ? data.documentationUrl : undefined,
          specificUrls: scrapeMode === 'specific' ? specificUrls : undefined,
          wishlist: wishlistItems,
        },
        { force: forceFresh }
      );

      // Store job ID and move to scraping step
      setScrapeJob(result.jobId, result.status);
      goToStep('scraping');
    } catch (error) {
      // Error is handled by the mutation's onError
      console.error('Failed to start scraping:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Scrape Mode Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            How would you like to provide documentation?
          </Label>
          <RadioGroup
            value={scrapeMode}
            onValueChange={(value) => setScrapeMode(value as ScrapeMode)}
            className="grid grid-cols-2 gap-4"
          >
            <Label
              htmlFor="mode-auto"
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                scrapeMode === 'auto'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="auto" id="mode-auto" className="mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <Search className="h-4 w-4" />
                  Auto-discover
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a docs URL and we&apos;ll find the relevant API pages automatically
                </p>
              </div>
            </Label>
            <Label
              htmlFor="mode-specific"
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                scrapeMode === 'specific'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="specific" id="mode-specific" className="mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4" />
                  Specific pages
                </div>
                <p className="text-xs text-muted-foreground">
                  Provide exact page URLs — faster, no site mapping needed
                </p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        {/* Auto-discover: Documentation URL */}
        {scrapeMode === 'auto' && (
          <FormField
            control={form.control}
            name="documentationUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  API Documentation URL
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://api.example.com/docs"
                    className="font-mono text-sm"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Enter the root URL — we&apos;ll map the site and find API documentation pages.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Specific pages: Multiple URLs */}
        {scrapeMode === 'specific' && (
          <FormField
            control={form.control}
            name="specificUrlsText"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documentation Page URLs
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={`https://api.example.com/docs/endpoints\nhttps://api.example.com/docs/authentication\nhttps://api.example.com/docs/rate-limits`}
                    className="min-h-[120px] font-mono text-sm"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Enter one URL per line (max 20). We&apos;ll scrape these pages directly — no
                  mapping needed.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Wishlist (optional) */}
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="wishlistInput"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Action Wishlist
                  <Badge variant="secondary" className="ml-1 text-xs">
                    Optional
                  </Badge>
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="e.g., Send message, List users, Create project"
                      onKeyDown={handleKeyDown}
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addWishlistItem}
                    disabled={!field.value?.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <FormDescription>
                  Tell us what actions you want and AI will prioritize finding them.
                </FormDescription>
              </FormItem>
            )}
          />

          {/* Wishlist items */}
          {wishlistItems.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {wishlistItems.map((item) => (
                <Badge key={item} variant="secondary" className="gap-1 py-1.5 pl-3 pr-1.5">
                  {item}
                  <button
                    type="button"
                    onClick={() => removeWishlistItem(item)}
                    className="ml-1 rounded-sm hover:bg-secondary-foreground/20"
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove {item}</span>
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Force Fresh Scrape Option */}
        <div className="flex items-start space-x-3 rounded-lg border border-border/50 bg-muted/30 p-4">
          <Checkbox
            id="force-fresh"
            checked={forceFresh}
            onCheckedChange={(checked) => setForceFresh(checked === true)}
          />
          <div className="space-y-1">
            <Label
              htmlFor="force-fresh"
              className="flex cursor-pointer items-center gap-2 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Force fresh scrape
            </Label>
            <p className="text-xs text-muted-foreground">
              Bypass cached results and re-scrape the documentation from scratch. Use this if
              you&apos;ve previously scraped this URL and want updated results.
            </p>
          </div>
        </div>

        {/* Example URLs - only show in auto mode */}
        {scrapeMode === 'auto' && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Example URLs:</p>
            <div className="flex flex-wrap gap-2">
              {[
                'https://api.slack.com/methods',
                'https://stripe.com/docs/api',
                'https://developers.notion.com/reference',
              ].map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => form.setValue('documentationUrl', url)}
                  className="rounded-md bg-background px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {url}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isPending} size="lg">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                {scrapeMode === 'specific' ? 'Scrape Pages' : 'Start Scraping'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
