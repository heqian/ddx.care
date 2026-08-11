/**
 * Test helpers for calling Mastra tool execute with correct typing.
 *
 * The installed Mastra execute signature is:
 *   execute?: (params, options: MastraToolInvocationOptions) => Promise<TSchemaOut | ValidationError | void>
 *
 * Tests call execute with a minimal context and narrow the result union.
 * This helper wraps the call so tests don't need to repeat the cast and
 * narrowing boilerplate.
 */

export interface ToolLike {
  execute?: (params: any, options?: any) => Promise<any>;
}

/**
 * Call a tool's execute with the given params and a minimal test context.
 * Returns the result narrowed to exclude `void` — the caller still checks
 * `result.ok` or `result.error` to distinguish success from failure.
 */
export async function callExecute<T = any>(
  tool: ToolLike,
  params: any,
): Promise<T> {
  if (!tool.execute) {
    throw new Error("Tool has no execute function");
  }
  const result = await tool.execute(params, {});
  if (result === undefined || result === null) {
    return { ok: false, error: "Tool returned void", retriable: false } as any;
  }
  return result as T;
}
