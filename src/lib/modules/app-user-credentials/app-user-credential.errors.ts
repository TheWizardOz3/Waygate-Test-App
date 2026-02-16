/**
 * AppUserCredential Module Errors
 *
 * Custom error classes for end-user credential operations.
 */

export class AppUserCredentialError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppUserCredentialError';
  }
}

export class AppUserCredentialNotFoundError extends AppUserCredentialError {
  constructor(identifier: string) {
    super('APP_USER_CREDENTIAL_NOT_FOUND', `App user credential '${identifier}' not found`, 404);
    this.name = 'AppUserCredentialNotFoundError';
  }
}
