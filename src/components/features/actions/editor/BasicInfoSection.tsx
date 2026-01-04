'use client';

import { UseFormReturn, FieldValues } from 'react-hook-form';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/ui/tag-input';
import { useTags } from '@/hooks';

interface BasicInfoSectionProps {
  form: UseFormReturn<FieldValues>;
  isEditing: boolean;
  integrationSlug?: string;
}

export function BasicInfoSection({ form, isEditing, integrationSlug }: BasicInfoSectionProps) {
  const [copied, setCopied] = useState(false);
  const actionSlug = form.watch('slug');
  const { data: tagsData } = useTags('actions');

  // Construct the Waygate Gateway API endpoint
  const waygateEndpoint =
    integrationSlug && actionSlug ? `/api/v1/actions/${integrationSlug}/${actionSlug}` : null;

  const copyToClipboard = async () => {
    if (!waygateEndpoint) return;
    try {
      // Copy full URL with current origin
      const fullUrl = `${window.location.origin}${waygateEndpoint}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>Define the action name, method, and endpoint</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="chat.postMessage" className="font-mono" {...field} />
                </FormControl>
                <FormDescription>A unique identifier for this action</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Slug */}
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="chat-post-message"
                    className="font-mono"
                    disabled={isEditing}
                    {...field}
                  />
                </FormControl>
                <FormDescription>URL-safe identifier (auto-generated if empty)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Send a message to a channel or direct message"
                  className="min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>Describe what this action does</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tags */}
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <TagInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  suggestions={tagsData?.tags ?? []}
                  placeholder="Add tags to organize..."
                />
              </FormControl>
              <FormDescription>Add tags to categorize and filter actions</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          {/* HTTP Method */}
          <FormField
            control={form.control}
            name="httpMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>HTTP Method</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Endpoint Template */}
          <FormField
            control={form.control}
            name="endpointTemplate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endpoint Path</FormLabel>
                <FormControl>
                  <Input placeholder="/chat.postMessage" className="font-mono" {...field} />
                </FormControl>
                <FormDescription>Use {'{param}'} for path parameters</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Waygate Gateway Endpoint */}
        {waygateEndpoint && (
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Waygate Gateway Endpoint
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                <span className="text-foreground">{waygateEndpoint}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                className="shrink-0"
                title="Copy full URL"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Call this endpoint with POST to invoke the action. Waygate handles the{' '}
              {form.watch('httpMethod') || 'HTTP'} request to the underlying API.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
