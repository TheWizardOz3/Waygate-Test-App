/**
 * Schema Drift Detection Error Classes
 *
 * Typed error classes for the schema drift detection system.
 */

/**
 * Base error class for schema drift errors
 */
export class SchemaDriftError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SchemaDriftError';
  }
}

/**
 * Drift report not found
 */
export class DriftReportNotFoundError extends SchemaDriftError {
  constructor(reportId: string) {
    super('DRIFT_REPORT_NOT_FOUND', `Drift report not found: ${reportId}`, 404);
    this.name = 'DriftReportNotFoundError';
  }
}

/**
 * Invalid status transition for a drift report (e.g., resolving an already-dismissed report)
 */
export class InvalidDriftStatusTransitionError extends SchemaDriftError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      'INVALID_DRIFT_STATUS_TRANSITION',
      `Cannot transition drift report from "${currentStatus}" to "${targetStatus}"`,
      400
    );
    this.name = 'InvalidDriftStatusTransitionError';
  }
}
