/**
 * AppUser Module Errors
 *
 * Custom error classes for app user operations.
 */

export class AppUserError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppUserError';
  }
}

export class AppUserNotFoundError extends AppUserError {
  constructor(identifier: string) {
    super('APP_USER_NOT_FOUND', `App user '${identifier}' not found`, 404);
    this.name = 'AppUserNotFoundError';
  }
}
