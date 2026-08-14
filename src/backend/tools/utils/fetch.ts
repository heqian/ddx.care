import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../../utils/errors";
import { getCached, setCached } from "./tool-cache";
import { logger } from "../../utils/logger";

export interface FetchJSONOptions extends RequestInit {
  timeoutMs?: number;
  ignore404?: boolean;
  errorPrefix?: string;
}

async function fetchResponse(
  url: string,
  options: FetchJSONOptions,
): Promise<Response | { ignored404: true }> {
  const {
    timeoutMs = 10000,
    ignore404 = false,
    errorPrefix = "API",
    signal,
    ...fetchOptions
  } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const res = await fetch(url, { ...fetchOptions, signal: combinedSignal });
    if (res.ok) return res;
    if (res.status === 429) {
      throw new RateLimitError(`${errorPrefix} rate limit exceeded (429)`);
    }
    if (res.status === 404 && ignore404) return { ignored404: true };
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentAPIError(
        `${errorPrefix} error: ${res.status} ${res.statusText}`,
        res.status,
      );
    }
    throw new Error(`${errorPrefix} error: ${res.status} ${res.statusText}`);
  } catch (error: unknown) {
    if (
      error instanceof APITimeoutError ||
      error instanceof RateLimitError ||
      error instanceof PermanentAPIError
    ) {
      throw error;
    }
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new APITimeoutError(
        `Request timeout after ${timeoutMs}ms for ${url}`,
      );
    }
    throw error;
  }
}

export async function fetchJSON(url: string, options: FetchJSONOptions = {}) {
  // Check cache first — a hit skips the HTTP call
  const cached = getCached(url);
  if (cached !== null) {
    logger.info("tool_cache_hit", { url });
    return cached;
  }

  const res = await fetchResponse(url, options);
  if ("ignored404" in res) return { error: true, results: [] };

  const data = await res.json();
  // Only cache successful HTTP 200 responses
  setCached(url, data);
  return data;
}

/**
 * Fetch a URL and return the response body as raw text.
 * Mirrors fetchJSON's caching, timeout, and typed-error handling, but for
 * endpoints that respond with non-JSON bodies (e.g. XML).
 * Only HTTP 200 responses are cached; errors and non-2xx are never cached.
 */
export async function fetchText(url: string, options: FetchJSONOptions = {}) {
  const cached = getCached(url);
  if (cached !== null) {
    logger.info("tool_cache_hit", { url });
    return cached as string;
  }

  const res = await fetchResponse(url, { ...options, ignore404: false });
  if ("ignored404" in res) return "";

  const text = await res.text();
  setCached(url, text);
  return text;
}
