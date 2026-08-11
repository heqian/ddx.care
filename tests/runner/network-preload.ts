/**
 * Network guard preload module.
 *
 * This module is installed via `bun --preload tests/runner/network-preload.ts`
 * on every applicable child and server process. It installs the network
 * guard before any test or application module imports.
 *
 * The guard reads its policy from runner-owned environment variables:
 *   DDX_NETWORK_POLICY: "loopback-only" or "provider-allowlist"
 *   DDX_NETWORK_ORIGIN: originating registration ID for diagnostics
 *   DDX_NETWORK_ALLOWED_HOSTS: comma-separated provider host allowlist
 *
 * Missing or malformed policy must fail closed (loopback-only).
 */

import { installNetworkGuard } from "./network-guard";

const policy = process.env.DDX_NETWORK_POLICY ?? "loopback-only";
const origin = process.env.DDX_NETWORK_ORIGIN ?? "unknown";
const allowedHosts = process.env.DDX_NETWORK_ALLOWED_HOSTS
  ? process.env.DDX_NETWORK_ALLOWED_HOSTS.split(",")
      .map((h) => h.trim())
      .filter(Boolean)
  : [];

installNetworkGuard({
  origin,
  allowedHosts: policy === "provider-allowlist" ? allowedHosts : [],
});
