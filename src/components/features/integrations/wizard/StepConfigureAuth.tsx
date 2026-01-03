'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Key, Shield, Loader2, Eye, EyeOff, Info, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWizardStore } from '@/stores/wizard.store';
import { useCreateIntegration } from '@/hooks';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import type { AuthType } from '@/lib/modules/integrations/integration.schemas';

// =============================================================================
// Form Schemas
// =============================================================================

const oauth2Schema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  scopes: z.string().optional(),
});

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  headerName: z.string().min(1),
  prefix: z.string(),
  baseUrl: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
});

type OAuth2FormData = z.infer<typeof oauth2Schema>;
type ApiKeyFormData = z.infer<typeof apiKeySchema>;

// =============================================================================
// Auth Type Components
// =============================================================================

function OAuth2Form({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: OAuth2FormData) => void;
  isLoading: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const { data } = useWizardStore();

  const form = useForm<OAuth2FormData>({
    resolver: zodResolver(oauth2Schema),
    defaultValues: {
      clientId: '',
      clientSecret: '',
      scopes: data.authConfig.scopes?.join(', ') || '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client ID</FormLabel>
              <FormControl>
                <Input placeholder="your-client-id" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="clientSecret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client Secret</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scopes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Scopes
                <Badge variant="secondary" className="ml-2 text-xs">
                  Optional
                </Badge>
              </FormLabel>
              <FormControl>
                <Input placeholder="read, write, admin" {...field} />
              </FormControl>
              <FormDescription>Comma-separated list of OAuth scopes</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-4">
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Integration...
              </>
            ) : (
              <>
                Create Integration
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ApiKeyForm({
  onSubmit,
  isLoading,
  apiName,
}: {
  onSubmit: (data: ApiKeyFormData) => void;
  isLoading: boolean;
  apiName?: string;
}) {
  const [showKey, setShowKey] = useState(false);
  const nameLower = apiName?.toLowerCase() || '';

  // Detect if this is a user-specific API that requires a base URL
  const isSupabase = nameLower.includes('supabase');
  const isAirtable = nameLower.includes('airtable');
  const requiresBaseUrl = isSupabase || isAirtable;

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      apiKey: '',
      headerName: isSupabase ? 'apikey' : 'Authorization', // Supabase uses 'apikey' header
      prefix: isSupabase ? 'none' : 'Bearer', // Supabase doesn't use prefix
      baseUrl: '',
    },
  });

  // Generate context-specific help text based on API name
  const getApiKeyHelp = () => {
    if (isSupabase) {
      return 'Use your "service_role" key for full access (found in Project Settings → API)';
    }
    if (nameLower.includes('stripe')) {
      return 'Find your API key in Dashboard → Developers → API keys';
    }
    if (nameLower.includes('openai') || nameLower.includes('gpt')) {
      return 'Find your API key at platform.openai.com → API keys';
    }
    if (nameLower.includes('github')) {
      return 'Create a Personal Access Token at Settings → Developer settings → Tokens';
    }
    if (nameLower.includes('slack')) {
      return 'Find your Bot Token at api.slack.com → Your Apps → OAuth & Permissions';
    }
    return 'Your API key will be encrypted and stored securely';
  };

  // Generate base URL help text
  const getBaseUrlHelp = () => {
    if (isSupabase) {
      return 'Your Supabase project URL (found in Project Settings → API)';
    }
    if (isAirtable) {
      return 'Your Airtable base URL (e.g., https://api.airtable.com/v0/your-base-id)';
    }
    return 'The base URL for API requests (unique to your account/project)';
  };

  const getBaseUrlPlaceholder = () => {
    if (isSupabase) {
      return 'https://your-project-id.supabase.co';
    }
    if (isAirtable) {
      return 'https://api.airtable.com/v0/your-base-id';
    }
    return 'https://your-api.example.com';
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Base URL field - shown for user-specific APIs like Supabase */}
        {requiresBaseUrl && (
          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  API Base URL
                  <Badge variant="default" className="ml-2 bg-amber-600 text-xs">
                    Required
                  </Badge>
                </FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder={getBaseUrlPlaceholder()}
                    className="font-mono"
                    {...field}
                  />
                </FormControl>
                <FormDescription className="text-xs">{getBaseUrlHelp()}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-••••••••••••"
                    className="font-mono"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormDescription className="text-xs">{getApiKeyHelp()}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="headerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Header Name</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select header" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Authorization">Authorization</SelectItem>
                    <SelectItem value="X-API-Key">X-API-Key</SelectItem>
                    <SelectItem value="X-Auth-Token">X-Auth-Token</SelectItem>
                    <SelectItem value="Api-Key">Api-Key</SelectItem>
                    <SelectItem value="apikey">apikey</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="prefix"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prefix</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select prefix" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Bearer">Bearer</SelectItem>
                    <SelectItem value="Token">Token</SelectItem>
                    <SelectItem value="Basic">Basic</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="pt-4">
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Integration...
              </>
            ) : (
              <>
                Create Integration
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function StepConfigureAuth() {
  const { data, setAuthConfig, setCreatedIntegration, goToStep } = useWizardStore();
  const createIntegration = useCreateIntegration();

  // Detected auth type from API docs - default to 'none' if no auth methods detected
  const detectedAuthType =
    data.detectedAuthMethods.length > 0 ? data.detectedAuthMethods[0]?.type || 'api_key' : 'none';
  const [selectedAuthType, setSelectedAuthType] = useState<string>(detectedAuthType);

  const createIntegrationWithAuth = async (
    authConfig: Record<string, unknown>,
    authType: AuthType,
    credentialData?: { apiKey: string; headerName: string; prefix: string; baseUrl?: string }
  ) => {
    // Generate slug from API name
    const slug = data.detectedApiName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Get selected actions
    const selectedActions = data.detectedActions.filter((a) => a.selected);

    // Convert selected actions to the format expected by the API
    const actionsToCreate = selectedActions.map((action) => ({
      name: action.name,
      slug: action.slug,
      method: action.method,
      path: action.path,
      description: action.description,
      pathParameters: action.pathParameters,
      queryParameters: action.queryParameters,
      requestBody: action.requestBody,
      responses: action.responses,
      tags: action.tags,
    }));

    try {
      // Only include baseUrl if it's a valid URL (not empty)
      // Use URL constructor for strict validation
      let validBaseUrl: string | undefined;
      const rawBaseUrl = data.detectedBaseUrl?.trim();
      if (rawBaseUrl) {
        try {
          new URL(rawBaseUrl); // Will throw if invalid
          validBaseUrl = rawBaseUrl;
        } catch {
          console.log('[Auth Config] Invalid baseUrl detected, omitting:', rawBaseUrl);
        }
      }

      const integration = await createIntegration.mutateAsync({
        name: data.detectedApiName || 'New Integration',
        slug: slug || `integration-${Date.now()}`,
        description: `Integration with ${data.detectedApiName} API`,
        documentationUrl: data.documentationUrl,
        authType,
        authConfig: {
          ...(validBaseUrl && { baseUrl: validBaseUrl }),
          // Don't store the actual API key in authConfig, just the header/prefix config
          ...(authConfig.headerName ? { headerName: String(authConfig.headerName) } : {}),
          ...(authConfig.prefix !== undefined ? { prefix: String(authConfig.prefix) } : {}),
        },
        tags: [],
        metadata: {},
        actions: actionsToCreate, // Pass the selected actions!
      });

      // If we have credential data (API key), save it to the credentials endpoint
      if (credentialData && credentialData.apiKey) {
        try {
          await apiClient.post(`/integrations/${integration.id}/credentials`, {
            type: 'api_key',
            apiKey: credentialData.apiKey,
            headerName: credentialData.headerName || 'Authorization',
            prefix: credentialData.prefix || 'Bearer',
            // Include baseUrl for user-specific APIs (e.g., Supabase project URL)
            ...(credentialData.baseUrl && { baseUrl: credentialData.baseUrl }),
          });
        } catch (credError) {
          console.error('[Auth Config] Failed to save credentials:', credError);
          // Integration was created, but credentials failed - warn the user
          toast.warning(
            'Integration created, but credentials could not be saved. Please add them manually.'
          );
        }
      }

      // Store auth config and created integration info
      setAuthConfig(authConfig as typeof data.authConfig);
      setCreatedIntegration(integration.id, integration.name, selectedActions.length);

      toast.success('Integration created successfully!');
      goToStep('success');
    } catch (error) {
      toast.error('Failed to create integration', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleOAuth2Submit = (formData: OAuth2FormData) => {
    createIntegrationWithAuth(
      {
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        scopes: formData.scopes
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      'oauth2'
    );
  };

  const handleApiKeySubmit = (formData: ApiKeyFormData) => {
    const prefix = formData.prefix === 'none' ? '' : formData.prefix;
    createIntegrationWithAuth(
      {
        headerName: formData.headerName,
        prefix: prefix,
      },
      'api_key',
      {
        apiKey: formData.apiKey,
        headerName: formData.headerName,
        prefix: prefix,
        // Pass baseUrl for user-specific APIs (stored with credential, not integration)
        baseUrl: formData.baseUrl || undefined,
      }
    );
  };

  const handleNoAuthSubmit = () => {
    createIntegrationWithAuth({}, 'none');
  };

  // Format auth type for display
  const formatAuthType = (type: string) => {
    switch (type) {
      case 'oauth2':
        return 'OAuth 2.0';
      case 'api_key':
        return 'API Key';
      case 'none':
        return 'No Authentication';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Detected auth info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {data.detectedAuthMethods.length > 0 ? (
            <>
              Detected authentication type:{' '}
              <Badge variant="secondary" className="ml-1">
                {formatAuthType(detectedAuthType)}
              </Badge>
            </>
          ) : (
            <>
              No authentication detected.{' '}
              <Badge variant="secondary" className="ml-1">
                Public API
              </Badge>
            </>
          )}
        </AlertDescription>
      </Alert>

      {/* Auth type tabs */}
      <Tabs value={selectedAuthType} onValueChange={setSelectedAuthType}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="none" className="gap-2">
            <Globe className="h-4 w-4" />
            None
          </TabsTrigger>
          <TabsTrigger value="api_key" className="gap-2">
            <Key className="h-4 w-4" />
            API Key
          </TabsTrigger>
          <TabsTrigger value="oauth2" className="gap-2">
            <Shield className="h-4 w-4" />
            OAuth 2.0
          </TabsTrigger>
        </TabsList>

        <TabsContent value="none" className="mt-4">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Globe className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-medium">No Authentication Required</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              This API is publicly accessible and doesn&apos;t require authentication credentials.
            </p>
            <Button onClick={handleNoAuthSubmit} disabled={createIntegration.isPending}>
              {createIntegration.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Integration...
                </>
              ) : (
                <>
                  Create Integration
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="api_key" className="mt-4">
          <ApiKeyForm
            onSubmit={handleApiKeySubmit}
            isLoading={createIntegration.isPending}
            apiName={data.detectedApiName}
          />
        </TabsContent>

        <TabsContent value="oauth2" className="mt-4">
          <OAuth2Form onSubmit={handleOAuth2Submit} isLoading={createIntegration.isPending} />
        </TabsContent>
      </Tabs>

      {/* Skip auth option - only show if not on 'none' tab */}
      {selectedAuthType !== 'none' && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => createIntegrationWithAuth({}, 'none')}
            disabled={createIntegration.isPending}
            className="text-muted-foreground"
          >
            Skip for now — configure auth later
          </Button>
        </div>
      )}
    </div>
  );
}
