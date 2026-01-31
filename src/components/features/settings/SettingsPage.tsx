'use client';

import { useState } from 'react';
import { Settings, User, Bell, Key, Palette, Loader2, Variable } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiKeyDisplay } from './ApiKeyDisplay';
import { VariablesSection } from './VariablesSection';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  organization: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface TenantSettings {
  id: string;
  name: string;
  email: string;
  organization?: string;
  waygateApiKey: string;
  notificationsEnabled: boolean;
  webhookUrl?: string;
}

interface SettingsPageProps {
  initialSettings?: TenantSettings;
  isLoading?: boolean;
}

type SettingsSection = 'general' | 'api' | 'variables' | 'notifications' | 'appearance';

const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: User },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'variables', label: 'Variables', icon: Variable },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

export function SettingsPage({ initialSettings, isLoading }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initialSettings?.notificationsEnabled ?? false
  );

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: initialSettings?.name ?? '',
      email: initialSettings?.email ?? '',
      organization: initialSettings?.organization ?? '',
    },
  });

  const handleSaveProfile = async (data: ProfileFormData) => {
    setIsSaving(true);
    try {
      await apiClient.patch('/settings/profile', data);
      toast.success('Profile updated successfully');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to update profile';
      toast.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateApiKey = async (): Promise<string> => {
    const response = await apiClient.post<{ apiKey: string }>('/settings/api-key/regenerate');
    return response.apiKey;
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    try {
      await apiClient.patch('/settings/notifications', { enabled });
      toast.success(enabled ? 'Notifications enabled' : 'Notifications disabled');
    } catch (err) {
      setNotificationsEnabled(!enabled); // Revert on error
      const error = err instanceof Error ? err.message : 'Failed to update notifications';
      toast.error(error);
    }
  };

  if (isLoading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>
      </div>

      {/* Linear-style settings layout */}
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar navigation */}
        <nav className="lg:w-48 lg:shrink-0">
          <ul className="flex flex-row gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:pb-0">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {activeSection === 'general' && (
            <SettingsSection title="Profile" description="Your account information">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSaveProfile)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" className="max-w-md" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="max-w-md"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="organization"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your company (optional)"
                            className="max-w-md"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          This will be displayed in your integration credentials
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </form>
              </Form>
            </SettingsSection>
          )}

          {activeSection === 'api' && (
            <SettingsSection title="API Keys" description="Manage your API authentication">
              <div className="space-y-8">
                <ApiKeyDisplay
                  apiKey={initialSettings?.waygateApiKey ?? 'wg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                  label="Waygate API Key"
                  description="Use this key to authenticate requests from your applications to the Waygate Gateway API"
                  onRegenerate={handleRegenerateApiKey}
                />

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Usage</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm text-muted-foreground">Request Header</p>
                      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-sm">
                        <code className="text-muted-foreground">
                          Authorization: Bearer{' '}
                          <span className="text-foreground">YOUR_API_KEY</span>
                        </code>
                      </pre>
                    </div>
                    <div>
                      <p className="mb-2 text-sm text-muted-foreground">Example Request</p>
                      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-sm">
                        <code className="text-muted-foreground">{`curl -X POST https://api.waygate.dev/v1/gateway/invoke \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"integrationSlug": "slack", "actionSlug": "send-message", "input": {...}}'`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'variables' && <VariablesSection />}

          {activeSection === 'notifications' && (
            <SettingsSection title="Notifications" description="Configure how you receive alerts">
              <div className="space-y-6">
                <SettingsRow
                  title="Email Notifications"
                  description="Receive email alerts for integration errors and important updates"
                >
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={handleToggleNotifications}
                  />
                </SettingsRow>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium">Webhook URL</h3>
                    <p className="text-sm text-muted-foreground">
                      Receive real-time alerts via webhook
                    </p>
                  </div>
                  <Input
                    type="url"
                    placeholder="https://your-app.com/webhooks/waygate"
                    defaultValue={initialSettings?.webhookUrl}
                    className="max-w-lg"
                  />
                  <Button variant="outline" size="sm">
                    Test Webhook
                  </Button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'appearance' && (
            <SettingsSection title="Appearance" description="Customize the look and feel">
              <SettingsRow
                title="Theme"
                description="Theme preferences are managed via the toggle in the sidebar"
              >
                <span className="text-sm text-muted-foreground">System default</span>
              </SettingsRow>
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
      </div>
      <div className="flex gap-8">
        <div className="w-48 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex-1 space-y-6">
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
