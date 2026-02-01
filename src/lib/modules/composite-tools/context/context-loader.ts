/**
 * Context Loader
 *
 * Loads the execution context for a composite tool operation.
 * This includes credentials, reference data, and connection settings
 * needed to invoke the underlying action.
 *
 * Context is loaded at invocation time after routing determines which
 * operation to use. This is more efficient than pre-loading all contexts.
 */

import type { Action, Integration, Connection } from '@prisma/client';
import type { CompositeToolOperation } from '@prisma/client';
import { findActionByIdWithIntegration } from '../../actions/action.repository';
import { getIntegrationByIdRaw } from '../../integrations/integration.service';
import { resolveConnection } from '../../connections';
import {
  getDecryptedCredential,
  type DecryptedCredential,
} from '../../credentials/credential.service';
import {
  findByTypes as findReferenceDataByTypes,
  getDataTypes as getReferenceDataTypes,
} from '../../reference-data';
import type { ReferenceDataContext } from '../../gateway/gateway.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Action with its integration data
 */
export interface ActionWithIntegration {
  action: Action;
  integration: Integration;
}

/**
 * Loaded context for an operation
 */
export interface OperationContext {
  /** The operation being executed */
  operation: CompositeToolOperation;
  /** The underlying action */
  action: Action;
  /** The integration the action belongs to */
  integration: Integration;
  /** The resolved connection for the integration */
  connection: Connection;
  /** Decrypted credentials for authentication */
  credential: DecryptedCredential | null;
  /** Reference data for context resolution (users, channels, etc.) */
  referenceData: ReferenceDataContext | undefined;
}

/**
 * Options for loading context
 */
export interface LoadContextOptions {
  /** Specific connection ID to use (optional, uses default if not provided) */
  connectionId?: string;
  /** Skip loading reference data (for performance) */
  skipReferenceData?: boolean;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when context loading fails
 */
export class ContextLoadError extends Error {
  constructor(
    message: string,
    public readonly code: ContextLoadErrorCode,
    public readonly operationId: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ContextLoadError';
  }
}

/**
 * Context loading error codes
 */
export const ContextLoadErrorCode = {
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  CREDENTIALS_NOT_FOUND: 'CREDENTIALS_NOT_FOUND',
  CREDENTIALS_EXPIRED: 'CREDENTIALS_EXPIRED',
  INTEGRATION_DISABLED: 'INTEGRATION_DISABLED',
} as const;

export type ContextLoadErrorCode = (typeof ContextLoadErrorCode)[keyof typeof ContextLoadErrorCode];

// =============================================================================
// Main Context Loading Functions
// =============================================================================

/**
 * Loads the execution context for a composite tool operation
 *
 * This function:
 * 1. Loads the action and integration for the operation
 * 2. Resolves the connection (default/primary if not specified)
 * 3. Loads decrypted credentials for authentication
 * 4. Loads reference data for context resolution (optional)
 *
 * @param tenantId - The tenant making the request
 * @param operation - The selected operation
 * @param options - Loading options
 * @returns The loaded operation context
 * @throws ContextLoadError if any required component cannot be loaded
 */
export async function loadOperationContext(
  tenantId: string,
  operation: CompositeToolOperation,
  options: LoadContextOptions = {}
): Promise<OperationContext> {
  // 1. Load action with integration
  const actionWithIntegration = await loadActionWithIntegration(operation);

  const { action, integration } = actionWithIntegration;

  // Verify integration is not disabled
  if (integration.status === 'disabled') {
    throw new ContextLoadError(
      `Integration '${integration.name}' is disabled`,
      ContextLoadErrorCode.INTEGRATION_DISABLED,
      operation.id,
      { integrationId: integration.id, integrationSlug: integration.slug }
    );
  }

  // Verify integration belongs to tenant
  if (integration.tenantId !== tenantId) {
    throw new ContextLoadError(
      `Integration '${integration.slug}' not found`,
      ContextLoadErrorCode.INTEGRATION_NOT_FOUND,
      operation.id,
      { integrationId: integration.id }
    );
  }

  // 2. Resolve connection
  const connection = await resolveConnection(tenantId, integration.id, options.connectionId);

  // 3. Load credentials (if integration requires auth)
  let credential: DecryptedCredential | null = null;
  if (integration.authType !== 'none') {
    credential = await loadCredentials(tenantId, integration.id, connection.id, operation.id);
  }

  // 4. Load reference data (optional)
  let referenceData: ReferenceDataContext | undefined;
  if (!options.skipReferenceData) {
    referenceData = await loadReferenceData(integration.id, connection.id);
  }

  return {
    operation,
    action,
    integration,
    connection,
    credential,
    referenceData,
  };
}

/**
 * Loads action with its integration data
 */
async function loadActionWithIntegration(
  operation: CompositeToolOperation
): Promise<ActionWithIntegration> {
  const actionWithIntegration = await findActionByIdWithIntegration(operation.actionId);

  if (!actionWithIntegration) {
    throw new ContextLoadError(
      `Action '${operation.actionId}' not found for operation '${operation.operationSlug}'`,
      ContextLoadErrorCode.ACTION_NOT_FOUND,
      operation.id,
      { actionId: operation.actionId, operationSlug: operation.operationSlug }
    );
  }

  // Load full integration details
  const integration = await getIntegrationByIdRaw(
    actionWithIntegration.integration.tenantId,
    actionWithIntegration.integration.id
  );

  if (!integration) {
    throw new ContextLoadError(
      `Integration '${actionWithIntegration.integration.slug}' not found`,
      ContextLoadErrorCode.INTEGRATION_NOT_FOUND,
      operation.id,
      { integrationId: actionWithIntegration.integration.id }
    );
  }

  return {
    action: actionWithIntegration,
    integration,
  };
}

/**
 * Loads and validates credentials for an operation
 */
async function loadCredentials(
  tenantId: string,
  integrationId: string,
  connectionId: string,
  operationId: string
): Promise<DecryptedCredential | null> {
  const credential = await getDecryptedCredential(integrationId, tenantId, connectionId);

  if (!credential) {
    throw new ContextLoadError(
      'No credentials configured for this integration',
      ContextLoadErrorCode.CREDENTIALS_NOT_FOUND,
      operationId,
      { integrationId, connectionId }
    );
  }

  // Check if credentials are expired or need reauth
  if (credential.status === 'needs_reauth') {
    throw new ContextLoadError(
      'Credentials require re-authentication',
      ContextLoadErrorCode.CREDENTIALS_EXPIRED,
      operationId,
      { integrationId, credentialId: credential.id }
    );
  }

  return credential;
}

/**
 * Loads reference data for an operation's integration
 * Returns undefined if no reference data is configured/available
 */
async function loadReferenceData(
  integrationId: string,
  connectionId: string
): Promise<ReferenceDataContext | undefined> {
  try {
    // Get all available data types for this integration/connection
    const dataTypes = await getReferenceDataTypes(integrationId, connectionId);

    if (dataTypes.length === 0) {
      return undefined;
    }

    // Fetch all reference data for these types
    const referenceData = await findReferenceDataByTypes(integrationId, connectionId, dataTypes);

    if (referenceData.length === 0) {
      return undefined;
    }

    // Group by data type and transform to context format
    const context: ReferenceDataContext = {};

    for (const item of referenceData) {
      if (!context[item.dataType]) {
        context[item.dataType] = [];
      }

      context[item.dataType].push({
        id: item.externalId,
        name: item.name,
        metadata: item.metadata as Record<string, unknown> | undefined,
      });
    }

    return context;
  } catch (error) {
    // Log but don't fail - reference data is optional enhancement
    console.warn('[CONTEXT_LOADER] Failed to load reference data:', error);
    return undefined;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Checks if credentials need to be loaded for an integration
 */
export function requiresCredentials(integration: Integration): boolean {
  return integration.authType !== 'none';
}

/**
 * Gets a summary of the loaded context for logging/debugging
 */
export function summarizeContext(context: OperationContext): {
  operationSlug: string;
  actionSlug: string;
  integrationSlug: string;
  connectionId: string;
  hasCredentials: boolean;
  hasReferenceData: boolean;
  referenceDataTypes: string[];
} {
  return {
    operationSlug: context.operation.operationSlug,
    actionSlug: context.action.slug,
    integrationSlug: context.integration.slug,
    connectionId: context.connection.id,
    hasCredentials: context.credential !== null,
    hasReferenceData: context.referenceData !== undefined,
    referenceDataTypes: context.referenceData ? Object.keys(context.referenceData) : [],
  };
}
