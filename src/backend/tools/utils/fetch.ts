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

let lastNcbiTime = 0;
const NCBI_RATE_LIMIT_MS = 334; // approx 3 requests per second
const NCBI_TOKEN_TIMEOUT_MS = 30000;
let ncbiPromise = Promise.resolve();

function getNcbiToken(): Promise<void> {
  const enteredAt = Date.now();
  ncbiPromise = ncbiPromise.then(async () => {
    const now = Date.now();
    const queueWait = now - enteredAt;
    if (queueWait > NCBI_TOKEN_TIMEOUT_MS) {
      throw new Error(
        `NCBI rate limiter queue wait exceeded ${NCBI_TOKEN_TIMEOUT_MS}ms (waited ${queueWait}ms)`,
      );
    }
    const elapsed = now - lastNcbiTime;
    if (elapsed < NCBI_RATE_LIMIT_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, NCBI_RATE_LIMIT_MS - elapsed),
      );
    }
    lastNcbiTime = Date.now();
  });
  return ncbiPromise;
}

export async function fetchJSON(url: string, options: FetchJSONOptions = {}) {
  const {
    timeoutMs = 10000,
    ignore404 = false,
    errorPrefix = "API",
    ...fetchOptions
  } = options;

  // Check cache first — a hit skips both the HTTP call and rate limiting
  const cached = getCached(url);
  if (cached !== null) {
    logger.info("tool_cache_hit", { url });
    return cached;
  }

  // Rate limiting for NCBI APIs
  if (url.includes("ncbi.nlm.nih.gov")) {
    await getNcbiToken();
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
