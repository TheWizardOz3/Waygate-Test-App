/**
 * Auto-Maintenance System Error Classes
 *
 * Typed error classes for the auto-maintenance proposal system.
 */

/**
 * Base error class for auto-maintenance errors
 */
export class AutoMaintenanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AutoMaintenanceError';
  }
}

/**
 * Maintenance proposal not found
 */
export class ProposalNotFoundError extends AutoMaintenanceError {
  constructor(proposalId: string) {
    super('PROPOSAL_NOT_FOUND', `Maintenance proposal not found: ${proposalId}`, 404);
    this.name = 'ProposalNotFoundError';
  }
}

/**
 * Invalid status transition for a proposal (e.g., can't approve an already-rejected proposal)
 */
export class InvalidProposalTransitionError extends AutoMaintenanceError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      'INVALID_PROPOSAL_TRANSITION',
      `Cannot transition proposal from "${currentStatus}" to "${targetStatus}"`,
      400
    );
    this.name = 'InvalidProposalTransitionError';
  }
}

/**
 * Conflict — pending proposal already exists for this action
 */
export class ProposalConflictError extends AutoMaintenanceError {
  constructor(actionId: string) {
    super(
      'PROPOSAL_CONFLICT',
      `A pending maintenance proposal already exists for action: ${actionId}`,
      409
    );
    this.name = 'ProposalConflictError';
  }
}

/**
 * Failed to apply schema update from an approved proposal
 */
export class SchemaApplicationError extends AutoMaintenanceError {
  constructor(proposalId: string, reason: string) {
    super(
      'SCHEMA_APPLICATION_ERROR',
      `Failed to apply schema update for proposal ${proposalId}: ${reason}`,
      500
    );
    this.name = 'SchemaApplicationError';
  }
}

/**
 * Failed to revert an approved proposal
 */
export class RevertError extends AutoMaintenanceError {
  constructor(proposalId: string, reason: string) {
    super('REVERT_ERROR', `Failed to revert proposal ${proposalId}: ${reason}`, 500);
    this.name = 'RevertError';
  }
}
