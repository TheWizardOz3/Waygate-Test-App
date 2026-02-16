/**
 * App Module Errors
 *
 * Custom error classes for app operations.
 */

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AppNotFoundError extends AppError {
  constructor(identifier: string) {
    super('APP_NOT_FOUND', `App '${identifier}' not found`, 404);
    this.name = 'AppNotFoundError';
  }
}

export class AppSlugConflictError extends AppError {
  constructor(slug: string) {
    super('APP_SLUG_CONFLICT', `An app with slug '${slug}' already exists`, 409);
    this.name = 'AppSlugConflictError';
  }
}

export class AppIntegrationConfigError extends AppError {
  constructor(message: string, statusCode: number = 400) {
    super('APP_INTEGRATION_CONFIG_ERROR', message, statusCode);
    this.name = 'AppIntegrationConfigError';
  }
}
