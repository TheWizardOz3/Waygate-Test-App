'use client';

import { UseFormReturn, FieldValues } from 'react-hook-form';
import { Globe } from 'lucide-react';
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
import { VariableAutocompleteInput, VariableHint } from './VariableAutocomplete';
import { VariableValidationInline } from './VariableValidation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EndpointTabProps {
  form: UseFormReturn<FieldValues>;
  isEditing: boolean;
  integrationSlug?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export function EndpointTab({ form, isEditing, integrationSlug }: EndpointTabProps) {
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold">Endpoint Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Define the API endpoint this action will call
        </p>
      </div>

      <div className="space-y-6">
        {/* Row 1: Name, Slug, Method, Endpoint Path - all on one row */}
        <div className="grid gap-4 lg:grid-cols-12">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="lg:col-span-3">
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Send Message" {...field} />
                </FormControl>
                <FormDescription>Human-readable name for this action</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem className="lg:col-span-2">
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="send-message"
                    {...field}
                    disabled={isEditing}
                    className="font-mono"
                  />
                </FormControl>
                <FormDescription>
                  {isEditing ? 'Cannot be changed after creation' : 'Auto-generated from name'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="httpMethod"
            render={({ field }) => (
              <FormItem className="lg:col-span-1">
                <FormLabel>Method</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {HTTP_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endpointTemplate"
            render={({ field }) => (
              <FormItem className="lg:col-span-6">
                <FormLabel>Endpoint Path</FormLabel>
                <FormControl>
                  <VariableAutocompleteInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="/api/${var.api_version}/messages/{channel_id}"
                  />
                </FormControl>
                <FormDescription>
                  Path template. Use {'{param}'} for dynamic segments or{' '}
                  <code className="rounded bg-muted px-1">${'{var.name}'}</code> for variables.
                </FormDescription>
                <VariableHint />
                <VariableValidationInline value={field.value} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Row 2: Description and Preview side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe what this action does..." rows={3} {...field} />
                </FormControl>
                <FormDescription>Optional description for documentation</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Preview */}
          {integrationSlug && (
            <div className="flex flex-col">
              <div className="mb-1.5 text-sm font-medium">Gateway Endpoint</div>
              <div className="flex flex-1 items-center rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <code className="font-mono text-sm">
                    POST /api/v1/actions/{integrationSlug}/{form.watch('slug') || 'action-slug'}
                  </code>
                </div>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                The URL your app will call to invoke this action
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
