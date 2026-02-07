/**
 * Batch Tool Variant Generator Unit Tests
 *
 * Tests for generating batch UniversalTool variants from batch-enabled actions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateBatchVariant,
  generateBatchVariants,
} from '@/lib/modules/batch-operations/batch-tool-variant';
import type { UniversalTool } from '@/lib/modules/tool-export/tool-export.schemas';

// =============================================================================
// Fixtures
// =============================================================================

const baseTool: UniversalTool = {
  name: 'salesforce_update_record',
  description: 'Update a record in Salesforce',
  parameters: {
    type: 'object',
    properties: {
      recordId: { type: 'string', description: 'The record ID' },
      fields: { type: 'object', description: 'Fields to update' },
    },
    required: ['recordId', 'fields'],
  },
};

// =============================================================================
// generateBatchVariant
// =============================================================================

describe('generateBatchVariant', () => {
  it('should return null when batchEnabled is false', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: false,
      batchConfig: null,
    });
    expect(result).toBeNull();
  });

  it('should generate variant when batchEnabled is true', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: null,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('batch_salesforce_update_record');
  });

  it('should wrap parameters in items array', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: null,
    });

    expect(result!.parameters.properties).toHaveProperty('items');
    expect(result!.parameters.properties!.items.type).toBe('array');
    expect(result!.parameters.required).toEqual(['items']);
  });

  it('should include config parameter with concurrency and delayMs', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: null,
    });

    expect(result!.parameters.properties).toHaveProperty('config');
    const config = result!.parameters.properties!.config;
    expect(config.properties).toHaveProperty('concurrency');
    expect(config.properties).toHaveProperty('delayMs');
  });

  it('should auto-generate description when no toolDescription', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: null,
    });

    expect(result!.description).toContain('Batch version of');
    expect(result!.description).toContain('salesforce_update_record');
    expect(result!.description).toContain('job ID');
  });

  it('should use custom toolDescription from batchConfig', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: {
        maxItems: 500,
        defaultConcurrency: 10,
        defaultDelayMs: 0,
        toolDescription: 'Custom batch tool description',
      },
    });

    expect(result!.description).toBe('Custom batch tool description');
  });

  it('should reflect batchConfig defaults in config descriptions', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: {
        maxItems: 500,
        defaultConcurrency: 3,
        defaultDelayMs: 100,
      },
    });

    const config = result!.parameters.properties!.config;
    expect(config.properties!.concurrency.description).toContain('default 3');
    expect(config.properties!.delayMs.description).toContain('default 100');
  });

  it('should preserve contextTypes from original tool', () => {
    const toolWithContext: UniversalTool = {
      ...baseTool,
      contextTypes: ['reference_data'],
    };

    const result = generateBatchVariant(toolWithContext, {
      batchEnabled: true,
      batchConfig: null,
    });

    expect(result!.contextTypes).toEqual(['reference_data']);
  });

  it('should handle malformed batchConfig gracefully', () => {
    const result = generateBatchVariant(baseTool, {
      batchEnabled: true,
      batchConfig: 'not-an-object' as unknown,
    });

    // Should fall back to defaults without crashing
    expect(result).not.toBeNull();
    expect(result!.name).toBe('batch_salesforce_update_record');
  });
});

// =============================================================================
// generateBatchVariants
// =============================================================================

describe('generateBatchVariants', () => {
  const tools: UniversalTool[] = [
    {
      name: 'salesforce_update_record',
      description: 'Update Salesforce record',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'salesforce_create_record',
      description: 'Create Salesforce record',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'slack_send_message',
      description: 'Send Slack message',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  ];

  const actions = [
    {
      slug: 'update-record',
      batchEnabled: true,
      batchConfig: null,
      integration: { slug: 'salesforce' },
    },
    {
      slug: 'create-record',
      batchEnabled: false,
      batchConfig: null,
      integration: { slug: 'salesforce' },
    },
    {
      slug: 'send-message',
      batchEnabled: true,
      batchConfig: null,
      integration: { slug: 'slack' },
    },
  ];

  it('should generate variants only for batch-enabled actions', () => {
    const variants = generateBatchVariants(tools, actions);
    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe('batch_salesforce_update_record');
    expect(variants[1].name).toBe('batch_slack_send_message');
  });

  it('should return empty array when no actions are batch-enabled', () => {
    const disabledActions = actions.map((a) => ({ ...a, batchEnabled: false }));
    const variants = generateBatchVariants(tools, disabledActions);
    expect(variants).toHaveLength(0);
  });

  it('should return empty array when tools are empty', () => {
    const variants = generateBatchVariants([], actions);
    expect(variants).toHaveLength(0);
  });

  it('should skip tools without matching actions', () => {
    const extraTool: UniversalTool = {
      name: 'github_create_issue',
      description: 'Create GitHub issue',
      parameters: { type: 'object', properties: {}, required: [] },
    };
    const variants = generateBatchVariants([...tools, extraTool], actions);
    // github_create_issue has no matching action, so no variant
    expect(variants).toHaveLength(2);
  });

  it('should match tools to actions by slug convention', () => {
    // Tool name format: {integration_slug}_{action_slug_with_hyphens_to_underscores}
    const variants = generateBatchVariants(tools, actions);
    const names = variants.map((v) => v.name);
    expect(names).toContain('batch_salesforce_update_record');
    expect(names).toContain('batch_slack_send_message');
  });
});
