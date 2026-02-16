'use client';

import { useTransition, useCallback } from 'react';
import { UseFormReturn, FieldValues } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Info, ShieldCheck, Database, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SettingsTabProps {
  form: UseFormReturn<FieldValues>;
}

export function SettingsTab({ form }: SettingsTabProps) {
  const [, startTransition] = useTransition();

  const cacheable = form.watch('cacheable');
  const retryConfig = form.watch('retryConfig');
  const validationConfig = form.watch('validationConfig');
  const validationEnabled = validationConfig?.enabled ?? true;
  const validationMode = validationConfig?.mode ?? 'warn';
  const driftEnabled = validationConfig?.driftDetection?.enabled ?? true;

  const updateValidationConfig = useCallback(
    (updates: Record<string, unknown>) => {
      startTransition(() => {
        const current = form.getValues('validationConfig') || {};
        form.setValue(
          'validationConfig',
          {
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
            ...current,
            ...updates,
          },
          { shouldDirty: true }
        );
      });
    },
    [form]
  );

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold">Action Settings</h2>
        <p className="text-sm text-muted-foreground">
          Control how responses are checked, cached, and retried when things go wrong
        </p>
      </div>

      {/* Three-column grid for settings cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Response Validation */}
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Response Validation</p>
                <p className="text-xs text-muted-foreground">
                  Check that API responses match the expected format
                </p>
              </div>
            </div>
            <Switch
              checked={validationEnabled}
              onCheckedChange={(checked) => updateValidationConfig({ enabled: checked })}
            />
          </div>

          <div
            className={`space-y-4 pt-2 ${!validationEnabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <div className="space-y-2">
              <Label className="text-sm">Mode</Label>
              <Select
                value={validationMode}
                onValueChange={(value) => updateValidationConfig({ mode: value })}
                disabled={!validationEnabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                        Warn
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Log issues but still return data
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="strict">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-red-500/10 text-red-600">
                        Strict
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Reject responses that don&apos;t match
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="lenient">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                        Lenient
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Automatically fix minor format differences
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Drift Detection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Schema Drift Detection</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Watches for repeated validation failures that may indicate the external API
                      has changed its response format — so you can fix it before it causes problems
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={driftEnabled}
                  disabled={!validationEnabled}
                  onCheckedChange={(checked) =>
                    updateValidationConfig({
                      driftDetection: {
                        ...validationConfig?.driftDetection,
                        enabled: checked,
                      },
                    })
                  }
                />
              </div>
              <div className={`space-y-3 ${!driftEnabled ? 'pointer-events-none opacity-50' : ''}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Detection Window</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={1440}
                      value={validationConfig?.driftDetection?.windowMinutes ?? 60}
                      onChange={(e) =>
                        updateValidationConfig({
                          driftDetection: {
                            ...validationConfig?.driftDetection,
                            windowMinutes: parseInt(e.target.value, 10) || 60,
                          },
                        })
                      }
                      disabled={!validationEnabled || !driftEnabled}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">minutes</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How far back to look when counting failures
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Alert threshold</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={validationConfig?.driftDetection?.failureThreshold ?? 5}
                      onChange={(e) =>
                        updateValidationConfig({
                          driftDetection: {
                            ...validationConfig?.driftDetection,
                            failureThreshold: parseInt(e.target.value, 10) || 5,
                          },
                        })
                      }
                      disabled={!validationEnabled || !driftEnabled}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">failures</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Number of failures before you get notified
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Caching */}
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Database className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium">Response Caching</p>
                <p className="text-xs text-muted-foreground">
                  Store responses temporarily to avoid redundant requests
                </p>
              </div>
            </div>
            <FormField
              control={form.control}
              name="cacheable"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className={`pt-2 ${!cacheable ? 'pointer-events-none opacity-50' : ''}`}>
            <FormField
              control={form.control}
              name="cacheTtlSeconds"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-2">
                    <Label className="text-sm">Cache TTL</Label>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={86400}
                          placeholder="300"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)
                          }
                          disabled={!cacheable}
                          className="h-8 w-24"
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      How long to reuse a stored response before fetching fresh data (0 = always
                      fetch)
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Retry Configuration */}
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <RefreshCw className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="font-medium">Automatic Retries</p>
                <p className="text-xs text-muted-foreground">
                  Automatically retry when the API is temporarily unavailable
                </p>
              </div>
            </div>
            <FormField
              control={form.control}
              name="retryConfig"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? { maxRetries: 3, retryableStatuses: [429, 500, 502, 503, 504] }
                            : null
                        )
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className={`space-y-4 pt-2 ${!retryConfig ? 'pointer-events-none opacity-50' : ''}`}>
            <FormField
              control={form.control}
              name="retryConfig.maxRetries"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Retries</Label>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        {...field}
                        value={field.value ?? 3}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        disabled={!retryConfig}
                        className="w-24"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      How many times to retry before giving up
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="retryConfig.retryableStatuses"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-2">
                    <Label className="text-sm">Status Codes to Retry</Label>
                    <FormControl>
                      <Input
                        placeholder="429, 500, 502, 503, 504"
                        value={field.value?.join(', ') ?? '429, 500, 502, 503, 504'}
                        onChange={(e) => {
                          const codes = e.target.value
                            .split(',')
                            .map((s) => parseInt(s.trim(), 10))
                            .filter((n) => !isNaN(n));
                          field.onChange(codes);
                        }}
                        disabled={!retryConfig}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Which error types to retry — 429 means &quot;too many requests&quot;, 500+
                      means the server had a problem
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
