/**
 * Cron Endpoint Authentication
 *
 * Shared utility for verifying Vercel Cron requests across all internal
 * cron endpoints. Validates the CRON_SECRET from the Authorization header.
 *
 * Pattern: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 *
 * Behavior:
 * - Development: Allows requests when CRON_SECRET is not set (for local testing)
 * - Production: Requires CRON_SECRET and validates the Authorization header
 */

import { NextRequest } from 'next/server';

/**
 * Verifies that a request is from Vercel Cron by checking the Authorization header
 * against the CRON_SECRET environment variable.
 *
 * @param request - The incoming Next.js request
 * @param logPrefix - Log prefix for identifying which cron endpoint is calling (e.g., "[TOKEN_REFRESH_CRON]")
 * @returns true if the request is authorized, false otherwise
 */
export function verifyCronSecret(request: NextRequest, logPrefix: string): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // In development without CRON_SECRET, allow requests for testing
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    console.warn(`${logPrefix} CRON_SECRET not set, allowing request in development`);
    return true;
  }

  // In production, CRON_SECRET must be set
  if (!cronSecret) {
    console.error(`${logPrefix} CRON_SECRET environment variable not set`);
    return false;
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    console.warn(`${logPrefix} Missing Authorization header`);
    return false;
  }

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const expectedHeader = `Bearer ${cronSecret}`;
  if (authHeader !== expectedHeader) {
    console.warn(`${logPrefix} Invalid Authorization header`);
    return false;
  }

  return true;
}
