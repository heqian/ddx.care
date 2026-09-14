import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../../utils/errors";
import { cacheKeyForUrl, getCached, setCached } from "./tool-cache";
import { logger } from "../../utils/logger";

export interface FetchJSONOptions extends RequestInit {
  timeoutMs?: number;
  ignore404?: boolean;
  errorPrefix?: string;
}

/**
 * Strip the query string from a URL before it enters an error message.
 * Query parameters carry PHI-derived terms (drug names, conditions) and
 * error messages flow into logs.
 */
function stripUrlQuery(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
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
        // No raw URL here — queries carry PHI-derived search terms.
        `Request timeout after ${timeoutMs}ms for ${stripUrlQuery(url)}`,
      );
    }
    throw error;
  }
}

export async function fetchJSON(url: string, options: FetchJSONOptions = {}) {
  // Check cache first — a hit skips the HTTP call. Log the hashed cache key,
  // never the URL: query parameters carry PHI-derived search terms.
  const cached = getCached(url);
  if (cached !== null) {
    logger.info("tool_cache_hit", { key: cacheKeyForUrl(url) });
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
    logger.info("tool_cache_hit", { key: cacheKeyForUrl(url) });
    return cached as string;
  }

  const res = await fetchResponse(url, { ...options, ignore404: false });
  if ("ignored404" in res) return "";

  const text = await res.text();
  setCached(url, text);
  return text;
}
