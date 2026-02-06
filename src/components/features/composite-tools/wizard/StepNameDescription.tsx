'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCompositeToolWizardStore } from '@/stores/compositeToolWizard.store';

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only'),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
});

type FormData = z.infer<typeof formSchema>;

// =============================================================================
// Helpers
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// =============================================================================
// Component
// =============================================================================

export function StepNameDescription() {
  const { data, setNameAndDescription, goToStep } = useCompositeToolWizardStore();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: data.name,
      slug: data.slug,
      description: data.description,
    },
  });

  // Auto-generate slug from name
  const name = form.watch('name');
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(!!data.slug);

  React.useEffect(() => {
    if (!slugManuallyEdited && name) {
      form.setValue('slug', generateSlug(name));
    }
  }, [name, slugManuallyEdited, form]);

  const onSubmit = (values: FormData) => {
    setNameAndDescription(values.name, values.slug, values.description || '');
    goToStep('routing-mode');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tool Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Smart Scraper" {...field} />
              </FormControl>
              <FormDescription>A human-readable name for your composite tool.</FormDescription>
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
                  placeholder="e.g., smart-scraper"
                  {...field}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    field.onChange(e);
                  }}
                />
              </FormControl>
              <FormDescription>
                A unique identifier used in API calls. Auto-generated from the name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what this tool does..."
                  className="min-h-[100px] resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                A brief description of what this tool does. This helps you and your team understand
                the tool&apos;s purpose.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" className="gap-2">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Form>
  );
}
