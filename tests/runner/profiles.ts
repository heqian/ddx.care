/**
 * Canonical execution profile registry.
 *
 * Each profile fixes the process kind, environment policy, network policy,
 * secret policy, and default-suite inclusion for a class of Bun test files
 * or parent-run startup cases. Profiles are the source of truth for how the
 * authoritative parent runner prepares a child process — they never embed
 * concrete test paths or a numeric inventory.
 *
 * Adding a new execution class requires adding a profile here and selecting
 * it from a registration fragment (see registrations.ts). Profiles are
 * intentionally exhaustive: a "catch-all" profile is prohibited.
 */

export type ProfileId =
  | "hermetic-bun"
  | "server-test"
  | "config-matrix"
  | "cache-enabled"
  | "cache-startup"
  | "orphadata-cache"
  | "token-secret-rest"
  | "token-secret-ws"
  | "frontend-dom"
  | "live-integration"
  | "live-contract"
  | "real-provider-smoke";

export type ProcessKind = "bun-test" | "server-entry" | "config-loader";

export type NetworkPolicy =
  | "loopback-only"
  | "provider-allowlist"
  | "provider-smoke-allowlist";

export type SecretPolicy =
  | "no-token-secret"
  | "generated-rest-secret"
  | "generated-ws-ticket-secret"
  | "generated-cache-key"
  | "cache-startup-disabled"
  | "cache-startup-enabled"
  | "cache-startup-expected-failure";

export type CachePolicy =
  | "disabled"
  | "enabled-positive"
  | "startup-controlled";

export interface ProfileDefinition {
  /** Stable identifier used by registrations. */
  id: ProfileId;
  /** Whether the parent spawns a Bun test child, an application server entry, or a config-loader child. */
  processKind: ProcessKind;
  /** Outbound network policy applied by the parent-installed guard. */
  network: NetworkPolicy;
  /** Cache TTL and key policy fixed before imports. */
  cache: CachePolicy;
  /** Token/secret policy fixed before imports. */
  secret: SecretPolicy;
  /** Whether the profile is included in the default non-live `test:all` suite. */
  defaultSuite: boolean;
  /** Whether the profile requires an explicit live-network trigger to execute. */
  liveTrigger: boolean;
  /** Whether the profile is protected (only runs under its exact environment gate). */
  protected: boolean;
  /** Human-readable policy summary for diagnostics and documentation. */
  summary: string;
}

const BASE_NONLIVE = {
  network: "loopback-only" as NetworkPolicy,
  defaultSuite: true,
  liveTrigger: false,
  protected: false,
};

const LIVE = {
  network: "provider-allowlist" as NetworkPolicy,
  defaultSuite: false,
  liveTrigger: true,
  protected: false,
};

export const PROFILES: Record<ProfileId, ProfileDefinition> = {
  "hermetic-bun": {
    ...BASE_NONLIVE,
    id: "hermetic-bun",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "One Bun test file, base cache-disabled environment, loopback-only network",
  },
  "server-test": {
    ...BASE_NONLIVE,
    id: "server-test",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Base policy plus a parent-owned application server, dynamic port, readiness, and teardown",
  },
  "config-matrix": {
    ...BASE_NONLIVE,
    id: "config-matrix",
    processKind: "config-loader",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Base process environment; alternate values are passed to the injected config loader rather than import-global mutation",
  },
  "cache-enabled": {
    ...BASE_NONLIVE,
    id: "cache-enabled",
    processKind: "bun-test",
    cache: "enabled-positive",
    secret: "generated-cache-key",
    summary:
      "Positive cache TTL, generated strict cache key, owned data root, no external network",
  },
  "cache-startup": {
    ...BASE_NONLIVE,
    id: "cache-startup",
    processKind: "server-entry",
    cache: "startup-controlled",
    secret: "cache-startup-enabled",
    summary:
      "Parent-owned application entry/startup case with declared disabled, enabled, or expected-failure cache mode fixed before import",
  },
  "orphadata-cache": {
    ...BASE_NONLIVE,
    id: "orphadata-cache",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Owned Orphadata leaf, mocked fetch, tool cache disabled, unmocked network denied",
  },
  "token-secret-rest": {
    ...BASE_NONLIVE,
    id: "token-secret-rest",
    processKind: "bun-test",
    cache: "disabled",
    secret: "generated-rest-secret",
    summary:
      "Dedicated generated REST token secret, parent-owned server, loopback only",
  },
  "token-secret-ws": {
    ...BASE_NONLIVE,
    id: "token-secret-ws",
    processKind: "bun-test",
    cache: "disabled",
    secret: "generated-ws-ticket-secret",
    summary:
      "Separate generated WebSocket ticket secret and process, parent-owned server, loopback only",
  },
  "frontend-dom": {
    ...BASE_NONLIVE,
    id: "frontend-dom",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Dedicated HappyDOM process and isolated browser-like globals, no external network",
  },
  "live-integration": {
    ...LIVE,
    id: "live-integration",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Explicit RUN_INTEGRATION=1, cache disabled, provider allowlist, environment-only execution",
  },
  "live-contract": {
    ...LIVE,
    id: "live-contract",
    processKind: "bun-test",
    cache: "disabled",
    secret: "no-token-secret",
    summary:
      "Explicit RUN_CONTRACT=1, cache disabled, provider allowlist, existing CI policy",
  },
  "real-provider-smoke": {
    id: "real-provider-smoke",
    processKind: "bun-test",
    network: "provider-smoke-allowlist",
    cache: "disabled",
    secret: "no-token-secret",
    defaultSuite: false,
    liveTrigger: false,
    protected: true,
    summary:
      "Protected environment only, exact clean source revision/lock/qualified-Bun identity required, mock mode absent, real deployed models, cache disabled, provider-host allowlist, non-disclosing artifacts",
  },
};

export const ALL_PROFILE_IDS: ReadonlyArray<ProfileId> = Object.keys(
  PROFILES,
) as ProfileId[];

export function getProfile(id: string): ProfileDefinition | undefined {
  return PROFILES[id as ProfileId];
}

export function isSupportedProfile(id: string): id is ProfileId {
  return id in PROFILES;
}
