export interface FetchJSONOptions extends RequestInit {
  timeoutMs?: number;
  ignore404?: boolean;
  errorPrefix?: string;
}

let lastNcbiTime = 0;
const NCBI_RATE_LIMIT_MS = 334; // approx 3 requests per second
let ncbiPromise = Promise.resolve();

function getNcbiToken(): Promise<void> {
  ncbiPromise = ncbiPromise.then(async () => {
    const now = Date.now();
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
      if (res.status === 404 && ignore404) {
        return { error: true, results: [] };
      }
      throw new Error(`${errorPrefix} error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
