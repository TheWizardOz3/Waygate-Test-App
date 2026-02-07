'use client';

/**
 * BatchActionConfig
 *
 * Per-action configuration panel for batch settings.
 * Includes batchEnabled toggle, batchConfig form, and optional bulkConfig section.
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Zap, Settings2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

// =============================================================================
// Types
// =============================================================================

export interface BatchConfigValues {
  maxItems: number;
  defaultConcurrency: number;
  defaultDelayMs: number;
  toolDescription?: string;
}

export interface BulkConfigValues {
  endpoint: string;
  httpMethod: 'POST' | 'PUT' | 'PATCH';
  payloadTransform: 'array' | 'csv' | 'ndjson';
  wrapperKey?: string;
  maxItemsPerCall: number;
  responseMapping: {
    itemIdField: string;
    successField: string;
    errorField: string;
  };
}

export interface BatchActionConfigProps {
  batchEnabled: boolean;
  batchConfig: BatchConfigValues | null;
  bulkConfig: BulkConfigValues | null;
  onChange: (values: {
    batchEnabled: boolean;
    batchConfig: BatchConfigValues | null;
    bulkConfig: BulkConfigValues | null;
  }) => void;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_BATCH_CONFIG: BatchConfigValues = {
  maxItems: 1000,
  defaultConcurrency: 5,
  defaultDelayMs: 0,
};

const DEFAULT_BULK_CONFIG: BulkConfigValues = {
  endpoint: '',
  httpMethod: 'POST',
  payloadTransform: 'array',
  maxItemsPerCall: 200,
  responseMapping: {
    itemIdField: 'id',
    successField: 'success',
    errorField: 'error',
  },
};

// =============================================================================
// Component
// =============================================================================

export function BatchActionConfig({
  batchEnabled,
  batchConfig,
  bulkConfig,
  onChange,
}: BatchActionConfigProps) {
  const [localBatchConfig, setLocalBatchConfig] = useState<BatchConfigValues>(
    batchConfig ?? DEFAULT_BATCH_CONFIG
  );
  const [localBulkConfig, setLocalBulkConfig] = useState<BulkConfigValues>(
    bulkConfig ?? DEFAULT_BULK_CONFIG
  );
  const [bulkOpen, setBulkOpen] = useState(!!bulkConfig);
  const [hasBulkConfig, setHasBulkConfig] = useState(!!bulkConfig);

  useEffect(() => {
    if (batchConfig) setLocalBatchConfig(batchConfig);
  }, [batchConfig]);

  useEffect(() => {
    if (bulkConfig) {
      setLocalBulkConfig(bulkConfig);
      setHasBulkConfig(true);
    }
  }, [bulkConfig]);

  function emitChange(
    enabled: boolean,
    bc: BatchConfigValues,
    useBulk: boolean,
    blk: BulkConfigValues
  ) {
    onChange({
      batchEnabled: enabled,
      batchConfig: enabled ? bc : null,
      bulkConfig: enabled && useBulk && blk.endpoint ? blk : null,
    });
  }

  function updateBatchConfig(partial: Partial<BatchConfigValues>) {
    const updated = { ...localBatchConfig, ...partial };
    setLocalBatchConfig(updated);
    emitChange(batchEnabled, updated, hasBulkConfig, localBulkConfig);
  }

  function updateBulkConfig(partial: Partial<BulkConfigValues>) {
    const updated = { ...localBulkConfig, ...partial };
    setLocalBulkConfig(updated);
    emitChange(batchEnabled, localBatchConfig, hasBulkConfig, updated);
  }

  function updateResponseMapping(partial: Partial<BulkConfigValues['responseMapping']>) {
    updateBulkConfig({
      responseMapping: { ...localBulkConfig.responseMapping, ...partial },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" />
          Batch Operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="batch-enabled">Enable batch processing</Label>
            <p className="text-sm text-muted-foreground">
              Expose a batch tool variant and accept batch API requests
            </p>
          </div>
          <Switch
            id="batch-enabled"
            checked={batchEnabled}
            onCheckedChange={(checked) => {
              emitChange(checked, localBatchConfig, hasBulkConfig, localBulkConfig);
            }}
          />
        </div>

        {batchEnabled && (
          <>
            <Separator />

            {/* Batch Config */}
            <div className="space-y-4">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <Settings2 className="h-3.5 w-3.5" />
                Batch Behavior
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-items">Max items per batch</Label>
                  <Input
                    id="max-items"
                    type="number"
                    min={1}
                    max={10000}
                    value={localBatchConfig.maxItems}
                    onChange={(e) =>
                      updateBatchConfig({ maxItems: parseInt(e.target.value) || 1000 })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delay-ms">Delay between items (ms)</Label>
                  <Input
                    id="delay-ms"
                    type="number"
                    min={0}
                    max={5000}
                    value={localBatchConfig.defaultDelayMs}
                    onChange={(e) =>
                      updateBatchConfig({ defaultDelayMs: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Default concurrency: {localBatchConfig.defaultConcurrency}</Label>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[localBatchConfig.defaultConcurrency]}
                  onValueChange={([val]) => updateBatchConfig({ defaultConcurrency: val })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of items processed in parallel (1-20)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tool-description">Tool description override (optional)</Label>
                <textarea
                  id="tool-description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Custom description for the batch tool variant..."
                  value={localBatchConfig.toolDescription ?? ''}
                  onChange={(e) =>
                    updateBatchConfig({
                      toolDescription: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </div>

            <Separator />

            {/* Bulk Config */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="bulk-enabled">Enable bulk API routing</Label>
                  <p className="text-sm text-muted-foreground">
                    Route through a bulk API endpoint instead of individual calls
                  </p>
                </div>
                <Switch
                  id="bulk-enabled"
                  checked={hasBulkConfig}
                  onCheckedChange={(checked) => {
                    setHasBulkConfig(checked);
                    emitChange(batchEnabled, localBatchConfig, checked, localBulkConfig);
                  }}
                />
              </div>

              {hasBulkConfig && (
                <Collapsible open={bulkOpen} onOpenChange={setBulkOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    {bulkOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Bulk API Configuration
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bulk-endpoint">Bulk endpoint</Label>
                        <Input
                          id="bulk-endpoint"
                          placeholder="/v1/records/bulk"
                          value={localBulkConfig.endpoint}
                          onChange={(e) => updateBulkConfig({ endpoint: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bulk-method">HTTP method</Label>
                        <Select
                          value={localBulkConfig.httpMethod}
                          onValueChange={(val) =>
                            updateBulkConfig({
                              httpMethod: val as 'POST' | 'PUT' | 'PATCH',
                            })
                          }
                        >
                          <SelectTrigger id="bulk-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="payload-transform">Payload transform</Label>
                        <Select
                          value={localBulkConfig.payloadTransform}
                          onValueChange={(val) =>
                            updateBulkConfig({
                              payloadTransform: val as 'array' | 'csv' | 'ndjson',
                            })
                          }
                        >
                          <SelectTrigger id="payload-transform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="array">JSON Array</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="ndjson">NDJSON</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="wrapper-key">Wrapper key (optional)</Label>
                        <Input
                          id="wrapper-key"
                          placeholder='e.g., "records"'
                          value={localBulkConfig.wrapperKey ?? ''}
                          onChange={(e) =>
                            updateBulkConfig({
                              wrapperKey: e.target.value || undefined,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-items-per-call">Max items per bulk call</Label>
                      <Input
                        id="max-items-per-call"
                        type="number"
                        min={1}
                        max={10000}
                        value={localBulkConfig.maxItemsPerCall}
                        onChange={(e) =>
                          updateBulkConfig({
                            maxItemsPerCall: parseInt(e.target.value) || 200,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>Response mapping</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="rm-item-id" className="text-xs text-muted-foreground">
                            Item ID field
                          </Label>
                          <Input
                            id="rm-item-id"
                            placeholder="id"
                            value={localBulkConfig.responseMapping.itemIdField}
                            onChange={(e) =>
                              updateResponseMapping({
                                itemIdField: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="rm-success" className="text-xs text-muted-foreground">
                            Success field
                          </Label>
                          <Input
                            id="rm-success"
                            placeholder="success"
                            value={localBulkConfig.responseMapping.successField}
                            onChange={(e) =>
                              updateResponseMapping({
                                successField: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="rm-error" className="text-xs text-muted-foreground">
                            Error field
                          </Label>
                          <Input
                            id="rm-error"
                            placeholder="error"
                            value={localBulkConfig.responseMapping.errorField}
                            onChange={(e) =>
                              updateResponseMapping({
                                errorField: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
