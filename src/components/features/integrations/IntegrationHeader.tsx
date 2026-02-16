'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { DeleteIntegrationDialog } from './DeleteIntegrationDialog';
import { TagInput } from '@/components/ui/tag-input';
import { TagList } from '@/components/ui/tag-badge';
import { useTags, useUpdateIntegration } from '@/hooks';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';
import { toast } from 'sonner';

interface IntegrationHeaderProps {
  integration: IntegrationResponse;
}

export function IntegrationHeader({ integration }: IntegrationHeaderProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);

  const { data: tagsData } = useTags('integrations');
  const updateIntegration = useUpdateIntegration();

  const handleCopySlug = async () => {
    await navigator.clipboard.writeText(integration.slug);
    setCopiedSlug(true);
    toast.success('Slug copied to clipboard');
    setTimeout(() => setCopiedSlug(false), 2000);
  };

  const handleRescrape = () => {
    // TODO: Implement re-scrape functionality
    toast.info('Re-scrape functionality coming soon');
  };

  const handleTagsChange = (newTags: string[]) => {
    updateIntegration.mutate({
      id: integration.id,
      tags: newTags,
    });
  };

  return (
    <>
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/integrations"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Integrations
          </Link>
          <span>/</span>
          <span className="text-foreground">{integration.name}</span>
        </div>

        {/* Main header - Linear style */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>

            <div className="space-y-1.5">
              {/* Title row */}
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-bold">{integration.name}</h1>
                <IntegrationStatusBadge status={integration.status} />
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                {/* Slug */}
                <button
                  onClick={handleCopySlug}
                  className="flex items-center gap-1.5 font-mono text-xs transition-colors hover:text-foreground"
                >
                  {copiedSlug ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {integration.slug}
                </button>

                {/* Documentation URL */}
                {integration.documentationUrl && (
                  <a
                    href={integration.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs transition-colors hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Documentation
                  </a>
                )}

                {/* Auth type */}
                {integration.authType === 'none' && integration.metadata?.authTypeUnverified ? (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 border-amber-500/30 bg-amber-500/10 text-xs font-normal text-amber-600"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    No Auth (unverified)
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="h-5 text-xs font-normal">
                    {integration.authType === 'oauth2'
                      ? 'OAuth 2.0'
                      : integration.authType === 'api_key'
                        ? 'API Key'
                        : integration.authType === 'bearer'
                          ? 'Bearer Token'
                          : integration.authType === 'basic'
                            ? 'Basic Auth'
                            : integration.authType === 'custom_header'
                              ? 'Custom Header'
                              : integration.authType === 'none'
                                ? 'No Auth'
                                : integration.authType}
                  </Badge>
                )}

                {/* Tags - inline with edit popover */}
                <Popover open={showTagEditor} onOpenChange={setShowTagEditor}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                      {integration.tags && integration.tags.length > 0 ? (
                        <TagList tags={integration.tags} size="sm" maxVisible={3} />
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <Plus className="h-3 w-3" />
                          Add tags
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Tags</p>
                      <TagInput
                        value={integration.tags ?? []}
                        onChange={handleTagsChange}
                        suggestions={tagsData?.tags ?? []}
                        placeholder="Add tags..."
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Description */}
              {integration.description && (
                <p className="max-w-2xl text-sm text-muted-foreground">{integration.description}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRescrape}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-scrape Documentation
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/integrations/${integration.id}/settings`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Integration
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Integration
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteIntegrationDialog
        integration={integration}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </>
  );
}
