/**
 * ConnectSession Module Errors
 *
 * Custom error classes for connect session operations.
 */

export class ConnectSessionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ConnectSessionError';
  }
}

export class ConnectSessionNotFoundError extends ConnectSessionError {
  constructor(identifier: string) {
    super('CONNECT_SESSION_NOT_FOUND', `Connect session '${identifier}' not found`, 404);
    this.name = 'ConnectSessionNotFoundError';
  }
}

export class ConnectSessionExpiredError extends ConnectSessionError {
  constructor(identifier: string) {
    super('CONNECT_SESSION_EXPIRED', `Connect session '${identifier}' has expired`, 410);
    this.name = 'ConnectSessionExpiredError';
  }
}

export class ConnectSessionAlreadyCompletedError extends ConnectSessionError {
  constructor(identifier: string) {
    super(
      'CONNECT_SESSION_ALREADY_COMPLETED',
      `Connect session '${identifier}' has already been completed`,
      409
    );
    this.name = 'ConnectSessionAlreadyCompletedError';
  }
}
