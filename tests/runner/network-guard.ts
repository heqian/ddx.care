/**
 * Non-live network guard preload.
 *
 * Installed by the parent runner before test modules load, this preload
 * rejects outbound requests in all non-live Bun profiles while allowing
 * loopback. Existing tests can replace the guarded `fetch` with mocks and
 * restore it to the guard. The guard identifies the originating test file
 * and host on failure.
 *
 * Provider allowlists are added only to declared live/protected profiles by
 * the parent — this module is the loopback-only default.
 */

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

interface GuardOptions {
  /** When set, allow these additional hosts (provider allowlist for live profiles). */
  allowedHosts?: ReadonlyArray<string>;
  /** Label identifying the originating registration/test file for diagnostics. */
  origin: string;
}

let originalFetch: typeof globalThis.fetch | null = null;
let installed = false;

export function installNetworkGuard(opts: GuardOptions): () => void {
  if (installed) {
    // Re-installation with a different allowlist replaces the previous guard.
  }
  const extra = new Set(opts.allowedHosts ?? []);
  if (!originalFetch) {
    originalFetch = globalThis.fetch;
  }
  const guard = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    const host = url.hostname;
    if (ALLOWED_HOSTS.has(host) || extra.has(host)) {
      return originalFetch!(input as any, init);
    }
    return Promise.reject(
      new Error(
        `Non-live network guard blocked request to ${host} from ${opts.origin}. Use mocks or declare a live profile with a provider allowlist.`,
      ),
    );
  }) as typeof globalThis.fetch;

  globalThis.fetch = guard;
  installed = true;

  return () => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    installed = false;
  };
}

export function isLoopbackHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host);
}
