'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Save, Globe, FileJson, Settings, GitBranch, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EndpointTab } from './editor/EndpointTab';
import { SchemaTab } from './editor/SchemaTab';
import { SettingsTab } from './editor/SettingsTab';
import { MappingsTab } from './editor/MappingsTab';
import { TestingTab } from './editor/TestingTab';
import { createEmptySchema } from './editor/types';
import { ActionEditorSchema, generateSlugFromName } from '@/lib/modules/actions/action.validation';
import { useCreateAction, useUpdateAction, useAction, useIntegration } from '@/hooks';
import type {
  JsonSchema,
  CreateActionInput,
  UpdateActionInput,
} from '@/lib/modules/actions/action.schemas';

interface ActionEditorProps {
  integrationId: string;
  actionId?: string;
}

export function ActionEditor({ integrationId, actionId }: ActionEditorProps) {
  const router = useRouter();
  const isEditing = !!actionId;
  const [activeTab, setActiveTab] = useState('endpoint');

  const { data: integration, isLoading: integrationLoading } = useIntegration(integrationId);
  const { data: existingAction, isLoading: actionLoading } = useAction(actionId, integrationId);

  const createAction = useCreateAction();
  const updateAction = useUpdateAction();

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
      });
    }
  }, [existingAction, form]);

  const name = form.watch('name');

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

  const onSubmit = async (data: FieldValues) => {
    try {
      if (isEditing && actionId) {
        const updatePayload: UpdateActionInput & { id: string } = {
          id: actionId,
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
        };
        await createAction.mutateAsync(createPayload);
        toast.success('Action created successfully');
      }
      router.push(`/integrations/${integrationId}/actions`);
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
        <Link href="/integrations" className="transition-colors hover:text-foreground">
          Integrations
        </Link>
        <span>/</span>
        <Link
          href={`/integrations/${integrationId}`}
          className="transition-colors hover:text-foreground"
        >
          {integration?.name ?? 'Integration'}
        </Link>
        <span>/</span>
        <Link
          href={`/integrations/${integrationId}/actions`}
          className="transition-colors hover:text-foreground"
        >
          Actions
        </Link>
        <span>/</span>
        <span className="text-foreground">{isEditing ? existingAction?.name : 'New'}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/integrations/${integrationId}/actions`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">
              {isEditing ? existingAction?.name : 'Create Action'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? `${existingAction?.httpMethod} ${existingAction?.endpointTemplate}`
                : `New action for ${integration?.name}`}
            </p>
          </div>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 lg:flex lg:w-auto lg:grid-cols-none">
              <TabsTrigger value="endpoint" className="gap-2">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Endpoint</span>
              </TabsTrigger>
              <TabsTrigger value="schema" className="gap-2">
                <FileJson className="h-4 w-4" />
                <span className="hidden sm:inline">Schema</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
              {isEditing && actionId && (
                <TabsTrigger value="mappings" className="gap-2">
                  <GitBranch className="h-4 w-4" />
                  <span className="hidden sm:inline">Mappings</span>
                </TabsTrigger>
              )}
              {isEditing && actionId && (
                <TabsTrigger value="testing" className="gap-2">
                  <Play className="h-4 w-4" />
                  <span className="hidden sm:inline">Test</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="endpoint" className="space-y-0">
              <EndpointTab
                form={form as unknown as import('react-hook-form').UseFormReturn<FieldValues>}
                isEditing={isEditing}
                integrationSlug={integration?.slug}
              />
            </TabsContent>

            <TabsContent value="schema" className="space-y-0">
              <SchemaTab
                inputSchema={form.watch('inputSchema') as JsonSchema}
                outputSchema={form.watch('outputSchema') as JsonSchema}
                onInputChange={handleInputSchemaChange}
                onOutputChange={handleOutputSchemaChange}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-0">
              <SettingsTab
                form={form as unknown as import('react-hook-form').UseFormReturn<FieldValues>}
              />
            </TabsContent>

            {isEditing && actionId && (
              <TabsContent value="mappings" className="space-y-0">
                <MappingsTab actionId={actionId} integrationId={integrationId} />
              </TabsContent>
            )}

            {isEditing && actionId && (
              <TabsContent value="testing" className="space-y-0">
                <TestingTab
                  actionId={actionId}
                  integrationId={integrationId}
                  actionSlug={existingAction?.slug ?? ''}
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
