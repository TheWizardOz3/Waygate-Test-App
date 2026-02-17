'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Loader2,
  Save,
  Globe,
  FileJson,
  Settings,
  GitBranch,
  Play,
  Zap,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EndpointTab } from './editor/EndpointTab';
import { SchemaTab } from './editor/SchemaTab';
import { SettingsTab } from './editor/SettingsTab';
import { AIToolsTab } from './editor/AIToolsTab';
import { MappingsTab } from './editor/MappingsTab';
import { TestingTab } from './editor/TestingTab';
import { createEmptySchema } from './editor/types';
import { ActionEditorSchema, generateSlugFromName } from '@/lib/modules/actions/action.validation';
import {
  useCreateAction,
  useUpdateAction,
  useAction,
  useIntegration,
  useRegenerateToolDescriptions,
} from '@/hooks';
import type {
  JsonSchema,
  CreateActionInput,
  UpdateActionInput,
} from '@/lib/modules/actions/action.schemas';

interface ActionEditorProps {
  integrationId: string;
  actionId?: string;
  connectionId?: string | null;
}

export function ActionEditor({ integrationId, actionId, connectionId }: ActionEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = !!actionId;

  // Read initial tab from URL query parameter
  const initialTab = searchParams.get('tab') || 'endpoint';
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: integration, isLoading: integrationLoading } = useIntegration(integrationId);
  const { data: existingAction, isLoading: actionLoading } = useAction(actionId, integrationId);

  const createAction = useCreateAction();
  const updateAction = useUpdateAction();
  const regenerateToolDescriptions = useRegenerateToolDescriptions();

  const isLoading = integrationLoading || (isEditing && actionLoading);
  const isSaving = createAction.isPending || updateAction.isPending;

  const form = useForm({
    resolver: zodResolver(ActionEditorSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      httpMethod: 'GET' as const,
      endpointTemplate: '/',
      inputSchema: createEmptySchema(),
      outputSchema: createEmptySchema(),
      cacheable: false,
      cacheTtlSeconds: null as number | null,
      tags: [] as string[],
      retryConfig: null as { maxRetries: number; retryableStatuses: number[] } | null,
      validationConfig: {
        enabled: true,
        mode: 'warn' as const,
        nullHandling: 'pass' as const,
        extraFields: 'preserve' as const,
        coercion: {
          stringToNumber: true,
          numberToString: true,
          stringToBoolean: true,
          emptyStringToNull: false,
          nullToDefault: true,
        },
        driftDetection: {
          enabled: true,
          windowMinutes: 60,
          failureThreshold: 5,
          alertOnDrift: true,
        },
        bypassValidation: false,
      },
      metadata: {} as Record<string, unknown>,
      toolDescription: null as string | null,
      toolSuccessTemplate: null as string | null,
      toolErrorTemplate: null as string | null,
    },
  });

  useEffect(() => {
    if (existingAction) {
      form.reset({
        name: existingAction.name,
        slug: existingAction.slug,
        description: existingAction.description ?? '',
        httpMethod: existingAction.httpMethod,
        endpointTemplate: existingAction.endpointTemplate,
        inputSchema: existingAction.inputSchema,
        outputSchema: existingAction.outputSchema,
        cacheable: existingAction.cacheable,
        cacheTtlSeconds: existingAction.cacheTtlSeconds,
        tags: existingAction.tags ?? [],
        retryConfig: existingAction.retryConfig,
        validationConfig: existingAction.validationConfig ?? {
          enabled: true,
          mode: 'warn',
          nullHandling: 'pass',
          extraFields: 'preserve',
          coercion: {
            stringToNumber: true,
            numberToString: true,
            stringToBoolean: true,
            emptyStringToNull: false,
            nullToDefault: true,
          },
          driftDetection: {
            enabled: true,
            windowMinutes: 60,
            failureThreshold: 5,
            alertOnDrift: true,
          },
          bypassValidation: false,
        },
        metadata: existingAction.metadata ?? {},
        toolDescription: existingAction.toolDescription ?? null,
        toolSuccessTemplate: existingAction.toolSuccessTemplate ?? null,
        toolErrorTemplate: existingAction.toolErrorTemplate ?? null,
      });
    }
  }, [existingAction, form]);

  // Use useWatch for optimized re-renders
  const name = useWatch({ control: form.control, name: 'name' });
  const watchedOutputSchema = useWatch({ control: form.control, name: 'outputSchema' });

  useEffect(() => {
    if (!isEditing && name) {
      form.setValue('slug', generateSlugFromName(name));
    }
  }, [name, isEditing, form]);

  const handleInputSchemaChange = useCallback(
    (schema: JsonSchema) => {
      form.setValue('inputSchema', schema);
    },
    [form]
  );

  const handleOutputSchemaChange = useCallback(
    (schema: JsonSchema) => {
      form.setValue('outputSchema', schema);
    },
    [form]
  );

  const handleRegenerateToolDescriptions = useCallback(async () => {
    if (!actionId || !integrationId) return;
    const result = await regenerateToolDescriptions.mutateAsync({
      actionId,
      integrationId,
    });
    // Update form with new descriptions
    form.setValue('toolDescription', result.toolDescription);
    form.setValue('toolSuccessTemplate', result.toolSuccessTemplate);
    form.setValue('toolErrorTemplate', result.toolErrorTemplate);
  }, [actionId, integrationId, regenerateToolDescriptions, form]);

  const onSubmit = async (data: FieldValues) => {
    try {
      if (isEditing && actionId) {
        const updatePayload: UpdateActionInput & { id: string; integrationId: string } = {
          id: actionId,
          integrationId,
          name: data.name,
          description: data.description,
          httpMethod: data.httpMethod,
          endpointTemplate: data.endpointTemplate,
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          cacheable: data.cacheable,
          cacheTtlSeconds: data.cacheTtlSeconds,
          retryConfig: data.retryConfig,
          validationConfig: data.validationConfig,
          metadata: data.metadata,
          toolDescription: data.toolDescription,
          toolSuccessTemplate: data.toolSuccessTemplate,
          toolErrorTemplate: data.toolErrorTemplate,
        };
        await updateAction.mutateAsync(updatePayload);
        toast.success('Action updated successfully');
      } else {
        const slug = data.slug || generateSlugFromName(data.name);
        const createPayload: CreateActionInput = {
          integrationId,
          name: data.name,
          slug,
          description: data.description,
          httpMethod: data.httpMethod,
          endpointTemplate: data.endpointTemplate,
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          cacheable: data.cacheable,
          cacheTtlSeconds: data.cacheTtlSeconds,
          tags: data.tags ?? [],
          retryConfig: data.retryConfig,
          validationConfig: data.validationConfig,
          metadata: data.metadata,
        };
        await createAction.mutateAsync(createPayload);
        toast.success('Action created successfully');
      }
      router.push(
        `/integrations/${integrationId}${connectionId ? `?connection=${connectionId}` : ''}`
      );
    } catch {
      // Error is handled by mutation
    }
  };

  if (isLoading) {
    return <ActionEditorSkeleton />;
  }

  return (
    <div className="space-y-6">
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
        <Link
          href={`/integrations/${integrationId}${connectionId ? `?connection=${connectionId}` : ''}`}
          className="transition-colors hover:text-foreground"
        >
          {integration?.name ?? 'Integration'}
        </Link>
        <span>/</span>
        <span className="text-foreground">{isEditing ? existingAction?.name : 'New Action'}</span>
      </div>

      {/* Header - Linear style */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>

          <div className="space-y-1.5">
            {/* Title row */}
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold">
                {isEditing ? existingAction?.name : 'Create Action'}
              </h1>
              {isEditing && existingAction?.httpMethod && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {existingAction.httpMethod}
                </Badge>
              )}
            </div>

            {/* Meta info */}
            <p className="text-sm text-muted-foreground">
              {isEditing ? existingAction?.endpointTemplate : `New action for ${integration?.name}`}
            </p>
          </div>
        </div>

        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving} className="shrink-0">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isEditing ? 'Save Changes' : 'Create Action'}
            </>
          )}
        </Button>
      </div>

      {/* Tabbed Content */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="endpoint"
                className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Globe className="h-4 w-4" />
                Endpoint
              </TabsTrigger>
              <TabsTrigger
                value="schema"
                className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <FileJson className="h-4 w-4" />
                Schema
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
              <TabsTrigger
                value="ai-tools"
                className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Sparkles className="h-4 w-4" />
                AI Tools
              </TabsTrigger>
              {isEditing && actionId && (
                <TabsTrigger
                  value="mappings"
                  className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <GitBranch className="h-4 w-4" />
                  Mappings
                </TabsTrigger>
              )}
              {isEditing && actionId && (
                <TabsTrigger
                  value="testing"
                  className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Play className="h-4 w-4" />
                  Test
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="endpoint" className="mt-6 space-y-0">
              <EndpointTab
                form={form as unknown as import('react-hook-form').UseFormReturn<FieldValues>}
                isEditing={isEditing}
                integrationSlug={integration?.slug}
              />
            </TabsContent>

            <TabsContent value="schema" className="mt-6 space-y-0">
              <SchemaTab
                inputSchema={form.watch('inputSchema') as JsonSchema}
                outputSchema={form.watch('outputSchema') as JsonSchema}
                onInputChange={handleInputSchemaChange}
                onOutputChange={handleOutputSchemaChange}
              />
            </TabsContent>

            <TabsContent value="settings" className="mt-6 space-y-0">
              <SettingsTab
                form={form as unknown as import('react-hook-form').UseFormReturn<FieldValues>}
              />
            </TabsContent>

            <TabsContent value="ai-tools" className="mt-6 space-y-0">
              <AIToolsTab
                form={form as unknown as import('react-hook-form').UseFormReturn<FieldValues>}
                integrationName={integration?.name}
                outputSchema={watchedOutputSchema as JsonSchema}
                onRegenerateToolDescriptions={
                  isEditing ? handleRegenerateToolDescriptions : undefined
                }
                actionId={isEditing ? actionId : undefined}
              />
            </TabsContent>

            {isEditing && actionId && (
              <TabsContent value="mappings" className="mt-6 space-y-0">
                <MappingsTab
                  actionId={actionId}
                  integrationId={integrationId}
                  inputSchema={existingAction?.inputSchema}
                  outputSchema={existingAction?.outputSchema}
                />
              </TabsContent>
            )}

            {isEditing && actionId && (
              <TabsContent value="testing" className="mt-6 space-y-0">
                <TestingTab
                  actionId={actionId}
                  integrationId={integrationId}
                  integrationSlug={integration?.slug ?? ''}
                  actionSlug={existingAction?.slug ?? ''}
                  connectionId={connectionId}
                />
              </TabsContent>
            )}
          </Tabs>
        </form>
      </Form>
    </div>
  );
}

function ActionEditorSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-64" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
