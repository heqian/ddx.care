/**
 * Discriminated union type for tool return values.
 * Tools return { ok: true, data } on success or { ok: false, error, retriable } on failure.
 * This lets agents reason about why data is missing instead of getting empty results.
 */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retriable: boolean };
