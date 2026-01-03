'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Key, Shield, Loader2, Eye, EyeOff, Info } from 'lucide-react';
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
}: {
  onSubmit: (data: ApiKeyFormData) => void;
  isLoading: boolean;
}) {
  const [showKey, setShowKey] = useState(false);

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      apiKey: '',
      headerName: 'Authorization',
      prefix: 'Bearer',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

  // Detected auth type from API docs
  const detectedAuthType = data.detectedAuthMethods[0]?.type || 'api_key';
  const [selectedAuthType, setSelectedAuthType] = useState<string>(detectedAuthType);

  const createIntegrationWithAuth = async (
    authConfig: Record<string, unknown>,
    authType: AuthType
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
      const integration = await createIntegration.mutateAsync({
        name: data.detectedApiName || 'New Integration',
        slug: slug || `integration-${Date.now()}`,
        description: `Integration with ${data.detectedApiName} API`,
        documentationUrl: data.documentationUrl,
        authType,
        authConfig: {
          baseUrl: data.detectedBaseUrl,
          ...authConfig,
        },
        tags: [],
        metadata: {},
        actions: actionsToCreate, // Pass the selected actions!
      });

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
    createIntegrationWithAuth(
      {
        apiKey: formData.apiKey,
        headerName: formData.headerName,
        prefix: formData.prefix === 'none' ? '' : formData.prefix,
      },
      'api_key'
    );
  };

  return (
    <div className="space-y-6">
      {/* Detected auth info */}
      {data.detectedAuthMethods.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Detected authentication type:{' '}
            <Badge variant="secondary" className="ml-1">
              {detectedAuthType === 'oauth2' ? 'OAuth 2.0' : 'API Key'}
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      {/* Auth type tabs */}
      <Tabs value={selectedAuthType} onValueChange={setSelectedAuthType}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="oauth2" className="gap-2">
            <Shield className="h-4 w-4" />
            OAuth 2.0
          </TabsTrigger>
          <TabsTrigger value="api_key" className="gap-2">
            <Key className="h-4 w-4" />
            API Key
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oauth2" className="mt-4">
          <OAuth2Form onSubmit={handleOAuth2Submit} isLoading={createIntegration.isPending} />
        </TabsContent>

        <TabsContent value="api_key" className="mt-4">
          <ApiKeyForm onSubmit={handleApiKeySubmit} isLoading={createIntegration.isPending} />
        </TabsContent>
      </Tabs>

      {/* Skip auth option */}
      <div className="text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => createIntegrationWithAuth({}, 'api_key')}
          disabled={createIntegration.isPending}
          className="text-muted-foreground"
        >
          Skip for now — configure auth later
        </Button>
      </div>
    </div>
  );
}
