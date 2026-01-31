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
    <div className="space-y-8">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold">Endpoint Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Define the API endpoint this action will call
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Name & Slug */}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
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
              <FormItem>
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
                  {isEditing
                    ? 'Cannot be changed after creation'
                    : 'Auto-generated from name, or customize'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Method & Endpoint */}
        <div className="grid gap-4 md:grid-cols-4">
          <FormField
            control={form.control}
            name="httpMethod"
            render={({ field }) => (
              <FormItem>
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
              <FormItem className="md:col-span-3">
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

        {/* Description */}
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
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Gateway Endpoint Preview</p>
            </div>
            <code className="font-mono text-sm">
              POST /api/v1/actions/{integrationSlug}/{form.watch('slug') || 'action-slug'}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
