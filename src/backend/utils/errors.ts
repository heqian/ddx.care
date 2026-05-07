/**
 * Typed error hierarchy for LLM and tool failures.
 *
 * AppError (base)
 * ├── RetriableError — retrying may succeed
 * │   ├── LLMTimeoutError
 * │   ├── APITimeoutError
 * │   └── RateLimitError
 * ├── NonRetriableError — retrying will not help
 * │   ├── SchemaValidationError
 * │   └── PermanentAPIError
 * └── ToolError — wraps a tool name + underlying error
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class RetriableError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "RetriableError";
  }
}

export class LLMTimeoutError extends RetriableError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "LLMTimeoutError";
  }
}

export class APITimeoutError extends RetriableError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "APITimeoutError";
  }
}

export class RateLimitError extends RetriableError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "RateLimitError";
  }
}

export class NonRetriableError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "NonRetriableError";
  }
}

export class SchemaValidationError extends NonRetriableError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "SchemaValidationError";
  }
}

export class PermanentAPIError extends NonRetriableError {
  constructor(
    message: string,
    public readonly statusCode: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "PermanentAPIError";
  }
}

export class ToolError extends AppError {
  constructor(
    public readonly toolName: string,
    message: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = "ToolError";
  }
}

/**
 * Extract a human-readable error type name for logging.
 * Returns the AppError subclass name or "UnknownError" for generic errors.
 */
export function getErrorTypeName(error: unknown): string {
  if (error instanceof AppError) {
    return error.name;
  }
  return "UnknownError";
}

/**
 * Determine if an error is retriable based on its class.
 * RetriableError subclasses are retriable; NonRetriableError subclasses are not.
 * Unknown errors default to retriable (safe backward-compatible default).
 */
export function isRetriableError(error: unknown): boolean {
  if (error instanceof NonRetriableError) return false;
  if (error instanceof RetriableError) return true;
  // Unknown errors default to retriable (backward compatible)
  return true;
}

const URL_REGEX = /https?:\/\/[^\s)>"']+/g;
const PATH_REGEX = /(?:\/[\w.-]+){2,}/g;

/**
 * Sanitize an error message before injecting it into agent context history.
 * Strips URLs (may contain API keys), file paths, and truncates to maxLength.
 */
export function sanitizeForContext(message: string, maxLength = 200): string {
  let sanitized = message;
  sanitized = sanitized.replace(URL_REGEX, "[url removed]");
  sanitized = sanitized.replace(PATH_REGEX, "[path removed]");
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength - 3)}...`;
  }
  return sanitized;
}
