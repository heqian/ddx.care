import {
  APITimeoutError,
  RateLimitError,
  PermanentAPIError,
} from "../../utils/errors";
import { getCached, setCached } from "./tool-cache";
import { logger } from "../../utils/logger";
import { markCacheHit } from "../../workflows/cache-context";

export interface FetchJSONOptions extends RequestInit {
  timeoutMs?: number;
  ignore404?: boolean;
  errorPrefix?: string;
}

export async function fetchJSON(url: string, options: FetchJSONOptions = {}) {
  const {
    timeoutMs = 10000,
    ignore404 = false,
    errorPrefix = "API",
    ...fetchOptions
  } = options;

  // Check cache first — a hit skips the HTTP call
  const cached = getCached(url);
  if (cached !== null) {
    logger.info("tool_cache_hit", { url });
    markCacheHit(url);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? controller.signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new RateLimitError(`${errorPrefix} rate limit exceeded (429)`);
      }
      if (res.status === 404 && ignore404) {
        return { error: true, results: [] };
      }
      if (res.status >= 400 && res.status < 500) {
        throw new PermanentAPIError(
          `${errorPrefix} error: ${res.status} ${res.statusText}`,
          res.status,
        );
      }
      throw new Error(`${errorPrefix} error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    // Only cache successful HTTP 200 responses
    setCached(url, data);
    return data;
  } catch (error: unknown) {
    if (
      error instanceof APITimeoutError ||
      error instanceof RateLimitError ||
      error instanceof PermanentAPIError
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new APITimeoutError(
        `Request timeout after ${timeoutMs}ms for ${url}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
