/**
 * Expected failures (forbidden, not found, invalid input, conflict). Screens show a
 * friendly message for the code; unexpected errors go to the error page with a reference.
 */
export type AppErrorCode = "forbidden" | "not_found" | "invalid" | "conflict";

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Machine-readable detail, e.g. a separation-of-duties reason. Never user data. */
  readonly detail?: string;

  constructor(code: AppErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
