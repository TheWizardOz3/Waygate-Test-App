'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Key, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  headerName: z.string().optional(),
  prefix: z.string().optional(),
  baseUrl: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
});

type ApiKeyFormData = z.infer<typeof apiKeySchema>;

interface ApiKeyConnectFormProps {
  integrationId: string;
  integrationName: string;
  headerName?: string;
  prefix?: string;
  /** Optional hint text about where to find the API key */
  apiKeyHint?: string;
  /** Whether this integration requires a base URL (e.g., Supabase project URL) */
  requiresBaseUrl?: boolean;
  /** Hint text for the base URL field */
  baseUrlHint?: string;
  /** Placeholder for the base URL field */
  baseUrlPlaceholder?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

type TestState = 'idle' | 'testing' | 'success' | 'error';

export function ApiKeyConnectForm({
  integrationId,
  integrationName,
  headerName = 'Authorization',
  prefix = 'Bearer',
  apiKeyHint,
  requiresBaseUrl = false,
  baseUrlHint,
  baseUrlPlaceholder = 'https://your-project.example.com',
  onSuccess,
  onError,
}: ApiKeyConnectFormProps) {
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Use a conditional schema that requires baseUrl when needed
  const formSchema = requiresBaseUrl
    ? apiKeySchema.extend({
        baseUrl: z.string().url('Please enter a valid URL'),
      })
    : apiKeySchema;

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiKey: '',
      headerName,
      prefix,
      baseUrl: '',
    },
  });

  const handleTestConnection = async () => {
    const apiKey = form.getValues('apiKey');
    if (!apiKey) {
      form.setError('apiKey', { message: 'Enter an API key to test' });
      return;
    }

    setTestState('testing');
    setTestError('');

    try {
      await apiClient.post(`/integrations/${integrationId}/credentials/test`, {
        apiKey,
        headerName: form.getValues('headerName') || headerName,
        prefix: form.getValues('prefix') || prefix,
      });

      setTestState('success');
      toast.success('Connection test successful!');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Connection test failed';
      setTestState('error');
      setTestError(error);
    }
  };

  const onSubmit = async (data: ApiKeyFormData) => {
    setIsSaving(true);

    try {
      await apiClient.post(`/integrations/${integrationId}/credentials`, {
        type: 'api_key',
        apiKey: data.apiKey,
        headerName: data.headerName || headerName,
        prefix: data.prefix || prefix,
        // Only include baseUrl if it's a valid URL
        ...(data.baseUrl && { baseUrl: data.baseUrl }),
      });

      toast.success(`API key saved for ${integrationName}`);
      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to save API key';
      toast.error(error);
      onError?.(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API Key Authentication
        </CardTitle>
        <CardDescription>Enter your API key to connect to {integrationName}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Base URL field - shown for user-specific APIs like Supabase */}
            {requiresBaseUrl && (
              <FormField
                control={form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Base URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder={baseUrlPlaceholder}
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {baseUrlHint ||
                        'The base URL for API requests (unique to your account/project)'}
                    </FormDescription>
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
                        placeholder="Enter your API key"
                        className="pr-10 font-mono"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    {apiKeyHint || 'Your API key will be encrypted before storage'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="headerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Header Name</FormLabel>
                    <FormControl>
                      <Input placeholder={headerName} className="font-mono" {...field} />
                    </FormControl>
                    <FormDescription>Default: {headerName}</FormDescription>
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
                    <FormControl>
                      <Input placeholder={prefix} className="font-mono" {...field} />
                    </FormControl>
                    <FormDescription>Default: {prefix}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Test Connection Result */}
            {testState === 'success' && (
              <Alert className="border-emerald-500/50 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <AlertDescription className="text-emerald-600">
                  Connection test successful! Your API key is valid.
                </AlertDescription>
              </Alert>
            )}

            {testState === 'error' && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {testError || 'Connection test failed. Please check your API key.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testState === 'testing'}
              >
                {testState === 'testing' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save API Key'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
