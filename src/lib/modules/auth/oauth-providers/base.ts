/**
 * OAuth Provider Base
 *
 * Abstract base class and interfaces for OAuth2 providers.
 * Supports Authorization Code flow (with PKCE), Client Credentials, and token refresh.
 */

import { randomBytes, createHash } from 'crypto';

/**
 * OAuth2 configuration for a provider
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  // Optional PKCE support
  usePkce?: boolean;
  // Additional parameters for authorization URL
  additionalAuthParams?: Record<string, string>;
  // Additional parameters for token request
  additionalTokenParams?: Record<string, string>;
}

/**
 * OAuth state stored during authorization flow
 */
export interface OAuthState {
  state: string;
  codeVerifier?: string; // For PKCE
  integrationId: string;
  tenantId: string;
  connectionId?: string; // For multi-app connections
  redirectAfterAuth?: string;
  createdAt: Date;
}

/**
 * Token response from OAuth provider
 */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number; // seconds
  scope?: string;
}

/**
 * Authorization URL result
 */
export interface AuthorizationUrlResult {
  url: string;
  state: OAuthState;
}

/**
 * Generates a cryptographically secure random state string
 */
export function generateState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generates PKCE code verifier and challenge
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  // Code verifier: 43-128 characters, URL-safe
  const codeVerifier = randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, 64);

  // Code challenge: SHA256 hash of verifier, base64url encoded
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

/**
 * Abstract base class for OAuth2 providers
 */
export abstract class OAuthProvider {
  constructor(protected config: OAuthConfig) {}

  /**
   * Generates the authorization URL for the OAuth flow
   */
  getAuthorizationUrl(
    integrationId: string,
    tenantId: string,
    redirectAfterAuth?: string,
    connectionId?: string
  ): AuthorizationUrlResult {
    const state = generateState();
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      ...this.config.additionalAuthParams,
    });

    let codeVerifier: string | undefined;

    // Add PKCE if enabled
    if (this.config.usePkce) {
      const pkce = generatePkce();
      codeVerifier = pkce.codeVerifier;
      params.set('code_challenge', pkce.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const url = `${this.config.authorizationUrl}?${params.toString()}`;

    return {
      url,
      state: {
        state,
        codeVerifier,
        integrationId,
        tenantId,
        connectionId,
        redirectAfterAuth,
        createdAt: new Date(),
      },
    };
  }

  /**
   * Exchanges an authorization code for tokens
   */
  async exchangeCode(code: string, storedState: OAuthState): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...this.config.additionalTokenParams,
    });

    // Add PKCE verifier if used
    if (storedState.codeVerifier) {
      params.set('code_verifier', storedState.codeVerifier);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OAuthError(
        'TOKEN_EXCHANGE_FAILED',
        `Failed to exchange authorization code: ${response.status} ${errorBody}`
      );
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  /**
   * Refreshes an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...this.config.additionalTokenParams,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OAuthError(
        'TOKEN_REFRESH_FAILED',
        `Failed to refresh token: ${response.status} ${errorBody}`
      );
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  /**
   * Parses a token response from the provider
   * Override this method for providers with non-standard responses
   */
  protected parseTokenResponse(data: Record<string, unknown>): OAuthTokenResponse {
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      tokenType: String(data.token_type || 'Bearer'),
      expiresIn: data.expires_in ? Number(data.expires_in) : undefined,
      scope: data.scope ? String(data.scope) : undefined,
    };
  }

  /**
   * Validates an access token (provider-specific)
   * Returns true if the token is valid, false otherwise
   */
  abstract validateToken(accessToken: string): Promise<boolean>;

  /**
   * Revokes a token (provider-specific)
   * May revoke just the access token or both access and refresh tokens
   */
  abstract revokeToken(token: string, tokenType?: 'access' | 'refresh'): Promise<void>;
}

/**
 * Error thrown during OAuth operations
 */
export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

/**
 * Validates that an OAuth state is not expired
 * Default expiration is 10 minutes
 */
export function isStateExpired(state: OAuthState, maxAgeMs: number = 600000): boolean {
  return Date.now() - state.createdAt.getTime() > maxAgeMs;
}
