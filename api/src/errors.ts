export type ErrorCode =
  'VALIDATION_ERROR' | 'INVALID_ID' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** The single error shape every non-2xx response uses. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

/**
 * An error the API knows how to present to the client. Anything else that reaches the error
 * handler is treated as a bug and surfaced as a generic 500 without leaking internals.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && this.details.length > 0 ? { details: this.details } : {}),
      },
    };
  }

  static validation(details: ErrorDetail[]): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  static invalidId(field: string, pattern: RegExp, example: string): ApiError {
    return new ApiError(400, 'INVALID_ID', `Invalid ${field} format`, [
      { field, message: `must match ${pattern} (for example "${example}")` },
    ]);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static methodNotAllowed(method: string, allowed: readonly string[]): ApiError {
    return new ApiError(405, 'METHOD_NOT_ALLOWED', `${method} is not allowed on this route`, undefined, {
      Allow: allowed.join(', '),
    });
  }

  static internal(): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
