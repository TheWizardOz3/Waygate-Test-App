/**
 * Drift Detection Repository
 *
 * Data access layer for validation failure tracking (drift detection).
 */

import prisma from '@/lib/db/client';
import type { ValidationFailure } from '@prisma/client';
import type { ValidationIssueCode } from '../validation.schemas';

// =============================================================================
// Types
// =============================================================================

export interface RecordFailureParams {
  actionId: string;
  tenantId: string;
  direction?: 'input' | 'output';
  issueCode: ValidationIssueCode;
  fieldPath: string;
  expectedType?: string;
  receivedType?: string;
}

export interface GetFailuresParams {
  actionId: string;
  tenantId: string;
  windowMinutes?: number;
}

export interface FailureStats {
  totalFailures: number;
  uniqueIssues: number;
  failuresByCode: Map<string, number>;
  failuresByPath: Map<string, number>;
  oldestFailure: Date | null;
  newestFailure: Date | null;
}

// =============================================================================
// Repository
// =============================================================================

/**
 * Repository for drift detection data
 */
export const driftRepository = {
  /**
   * Record a validation failure (upsert - increment count if exists)
   */
  async recordFailure(params: RecordFailureParams): Promise<ValidationFailure> {
    const {
      actionId,
      tenantId,
      direction = 'output',
      issueCode,
      fieldPath,
      expectedType,
      receivedType,
    } = params;

    // Upsert: create or update existing failure record
    return prisma.validationFailure.upsert({
      where: {
        validation_failures_unique_idx: {
          actionId,
          direction,
          issueCode,
          fieldPath,
        },
      },
      create: {
        actionId,
        tenantId,
        direction,
        issueCode,
        fieldPath,
        expectedType,
        receivedType,
        failureCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        driftAlertSent: false,
      },
      update: {
        failureCount: { increment: 1 },
        lastSeenAt: new Date(),
        // Update types if provided (they might have changed)
        ...(expectedType && { expectedType }),
        ...(receivedType && { receivedType }),
      },
    });
  },

  /**
   * Get failures for an action within a time window
   */
  async getRecentFailures(params: GetFailuresParams): Promise<ValidationFailure[]> {
    const { actionId, tenantId, windowMinutes = 60 } = params;

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    return prisma.validationFailure.findMany({
      where: {
        actionId,
        tenantId,
        lastSeenAt: { gte: windowStart },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  },

  /**
   * Get total failure count for an action within a time window
   */
  async getFailureCount(params: GetFailuresParams): Promise<number> {
    const { actionId, tenantId, windowMinutes = 60 } = params;

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const result = await prisma.validationFailure.aggregate({
      where: {
        actionId,
        tenantId,
        lastSeenAt: { gte: windowStart },
      },
      _sum: { failureCount: true },
    });

    return result._sum.failureCount ?? 0;
  },

  /**
   * Get failure statistics for an action
   */
  async getFailureStats(params: GetFailuresParams): Promise<FailureStats> {
    const failures = await this.getRecentFailures(params);

    const failuresByCode = new Map<string, number>();
    const failuresByPath = new Map<string, number>();
    let totalFailures = 0;
    let oldestFailure: Date | null = null;
    let newestFailure: Date | null = null;

    for (const failure of failures) {
      totalFailures += failure.failureCount;

      // Count by code
      const codeCount = failuresByCode.get(failure.issueCode) ?? 0;
      failuresByCode.set(failure.issueCode, codeCount + failure.failureCount);

      // Count by path
      const pathCount = failuresByPath.get(failure.fieldPath) ?? 0;
      failuresByPath.set(failure.fieldPath, pathCount + failure.failureCount);

      // Track oldest/newest
      if (!oldestFailure || failure.firstSeenAt < oldestFailure) {
        oldestFailure = failure.firstSeenAt;
      }
      if (!newestFailure || failure.lastSeenAt > newestFailure) {
        newestFailure = failure.lastSeenAt;
      }
    }

    return {
      totalFailures,
      uniqueIssues: failures.length,
      failuresByCode,
      failuresByPath,
      oldestFailure,
      newestFailure,
    };
  },

  /**
   * Mark drift alert as sent for an action
   */
  async markDriftAlertSent(actionId: string, tenantId: string): Promise<void> {
    await prisma.validationFailure.updateMany({
      where: {
        actionId,
        tenantId,
        driftAlertSent: false,
      },
      data: {
        driftAlertSent: true,
        driftAlertSentAt: new Date(),
      },
    });
  },

  /**
   * Check if drift alert has been sent recently (within window)
   */
  async hasDriftAlertBeenSent(
    actionId: string,
    tenantId: string,
    windowMinutes: number = 60
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentAlert = await prisma.validationFailure.findFirst({
      where: {
        actionId,
        tenantId,
        driftAlertSent: true,
        driftAlertSentAt: { gte: windowStart },
      },
    });

    return recentAlert !== null;
  },

  /**
   * Clear old failure records (for cleanup jobs)
   */
  async clearOldFailures(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await prisma.validationFailure.deleteMany({
      where: {
        lastSeenAt: { lt: cutoffDate },
      },
    });

    return result.count;
  },

  /**
   * Reset drift tracking for an action (e.g., after schema update)
   */
  async resetDriftTracking(actionId: string, tenantId: string): Promise<void> {
    await prisma.validationFailure.deleteMany({
      where: {
        actionId,
        tenantId,
      },
    });
  },

  /**
   * Get all actions with drift alerts
   */
  async getActionsWithDrift(tenantId: string): Promise<string[]> {
    const failures = await prisma.validationFailure.findMany({
      where: {
        tenantId,
        driftAlertSent: true,
      },
      select: {
        actionId: true,
      },
      distinct: ['actionId'],
    });

    return failures.map((f) => f.actionId);
  },
};
