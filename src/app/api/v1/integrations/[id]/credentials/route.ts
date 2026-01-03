/**
 * Credentials Endpoint
 *
 * GET /api/v1/integrations/:id/credentials
 * POST /api/v1/integrations/:id/credentials
 *
 * Returns the credential status or creates new credentials for an integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getIntegrationAuthStatus, AuthServiceError } from '@/lib/modules/auth/auth.service';
import {
  storeApiKeyCredential,
  storeOAuth2Credential,
  storeBearerCredential,
  CredentialError,
} from '@/lib/modules/credentials';

// Schema for creating API key credentials
const CreateApiKeyCredentialSchema = z.object({
  type: z.literal('api_key'),
  apiKey: z.string().min(1, 'API key is required'),
  headerName: z.string().optional().default('Authorization'),
  prefix: z.string().optional().default('Bearer'),
  baseUrl: z.string().url().optional(), // Per-credential base URL (e.g., Supabase project URL)
});

// Schema for creating Bearer credentials
const CreateBearerCredentialSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1, 'Token is required'),
  baseUrl: z.string().url().optional(), // Per-credential base URL
});

// Schema for creating OAuth2 credentials (typically from callback, but support direct)
const CreateOAuth2CredentialSchema = z.object({
  type: z.literal('oauth2'),
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  expiresIn: z.number().optional(), // seconds until expiration
  tokenType: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

const CreateCredentialSchema = z.discriminatedUnion('type', [
  CreateApiKeyCredentialSchema,
  CreateBearerCredentialSchema,
  CreateOAuth2CredentialSchema,
]);

export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const integrationIdIndex = pathParts.indexOf('integrations') + 1;
    const integrationId = pathParts[integrationIdIndex];

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
          },
        },
        { status: 400 }
      );
    }

    const status = await getIntegrationAuthStatus(integrationId, tenant.id);

    return NextResponse.json(
      {
        success: true,
        data: status,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('Credentials status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching credential status',
        },
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/v1/integrations/:id/credentials
 *
 * Creates or updates credentials for an integration.
 *
 * Request Body:
 * For API Key:
 * - type: "api_key"
 * - apiKey: The API key
 * - headerName: Header name (default: "Authorization")
 * - prefix: Prefix (default: "Bearer")
 *
 * For Bearer:
 * - type: "bearer"
 * - token: The bearer token
 *
 * For OAuth2:
 * - type: "oauth2"
 * - accessToken: The access token
 * - refreshToken: (optional) The refresh token
 * - expiresAt: (optional) Expiration datetime
 * - scopes: (optional) Array of scopes
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const integrationIdIndex = pathParts.indexOf('integrations') + 1;
    const integrationId = pathParts[integrationIdIndex];

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Verify the integration exists and belongs to this tenant
    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId,
        tenantId: tenant.id,
      },
    });

    if (!integration) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRATION_NOT_FOUND',
            message: 'Integration not found',
          },
        },
        { status: 404 }
      );
    }

    // Parse and validate the request body
    const body = await request.json();
    const parsed = CreateCredentialSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid credential data',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    let credential;

    // Store the credential based on type
    switch (data.type) {
      case 'api_key':
        credential = await storeApiKeyCredential(tenant.id, integrationId, {
          apiKey: data.apiKey,
          placement: 'header',
          paramName: data.headerName,
          baseUrl: data.baseUrl, // Per-credential base URL
        });
        break;

      case 'bearer':
        credential = await storeBearerCredential(tenant.id, integrationId, {
          token: data.token,
          baseUrl: data.baseUrl, // Per-credential base URL
        });
        break;

      case 'oauth2':
        credential = await storeOAuth2Credential(tenant.id, integrationId, {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenType: data.tokenType,
          expiresIn: data.expiresIn,
          scopes: data.scopes,
        });
        break;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: credential.id,
          credentialType: credential.credentialType,
          status: credential.status,
          createdAt: credential.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof CredentialError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('Credential creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred while saving credentials',
        },
      },
      { status: 500 }
    );
  }
});
