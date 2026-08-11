#!/usr/bin/env bun
/**
 * Discovery-driven test runner entrypoint.
 *
 * Replaces hand-maintained Bun file lists in package scripts. Discovers
 * every tests-suffixed .test.ts/.test.tsx file, resolves typed registrations,
 * validates the inventory, and runs the selected profiles.
 *
 * Usage:
 *   bun run tests/runner/run.ts                     # default non-live suite
 *   bun run tests/runner/run.ts --profile hermetic-bun
 *   bun run tests/runner/run.ts --profile token-secret-rest --profile hermetic-bun
 *   bun run tests/runner/run.ts --live-integration   # include live-integration
 *   bun run tests/runner/run.ts --live-contract      # include live-contract
 *   bun run tests/runner/run.ts --validate           # discovery-only validation
 *   bun run tests/runner/run.ts --list               # list discovered inventory
 */

import {
  discoverTests,
  assertDiscoveryValid,
  selectByProfile,
  selectDefaultSuite,
} from "./discover";
import { runAll, type RunnerOptions } from "./parent";
import { PROFILES, type ProfileId } from "./profiles";
import { parseCliArgs, CliError } from "./cli";

async function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof CliError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  if (args.help) {
    console.log("Usage: bun run tests/runner/run.ts [options]");
    console.log("Options:");
    console.log(
      "  --profile <id>      Run only the specified profile (repeatable)",
    );
    console.log("  --live-integration  Include live-integration profile");
    console.log("  --live-contract     Include live-contract profile");
    console.log(
      "  --concurrency <n>   Max concurrent children (default 1, max 64)",
    );
    console.log(
      "  --timeout <ms>      Per-child timeout (default 120000, max 3600000)",
    );
    console.log(
      "  --validate          Discovery-only validation, do not run tests",
    );
    console.log("  --list              List discovered inventory and exit");
    console.log("  --help              Show this help message");
    console.log("");
    console.log("Available profiles:");
    for (const [id, def] of Object.entries(PROFILES)) {
      console.log(`  ${id.padEnd(25)} ${def.summary}`);
    }
    process.exit(0);
  }

  const result = await discoverTests();
  assertDiscoveryValid(result);

  if (args.validate) {
    console.log(
      `Discovery validation passed: ${result.resolved.size} test(s) classified.`,
    );
    process.exit(0);
  }

  if (args.list) {
    for (const [path, reg] of result.resolved) {
      console.log(`  ${reg.profile.padEnd(25)} ${path}`);
    }
    process.exit(0);
  }

  const requestedProfiles = new Set<ProfileId>();
  for (const p of args.profiles) {
    requestedProfiles.add(p as ProfileId);
  }
  if (args.liveIntegration) requestedProfiles.add("live-integration");
  if (args.liveContract) requestedProfiles.add("live-contract");

  let selected;
  if (requestedProfiles.size > 0) {
    // Validate all requested profiles are supported
    for (const p of requestedProfiles) {
      if (!(p in PROFILES)) {
        console.error(`Unsupported profile: ${p}`);
        console.error(`Available: ${Object.keys(PROFILES).join(", ")}`);
        process.exit(1);
      }
    }
    selected = selectByProfile(result, [
      ...requestedProfiles,
    ] as unknown as ProfileId[]);
  } else {
    selected = selectDefaultSuite(result);
  }

  if (selected.length === 0) {
    console.error("No tests matched the selection.");
    process.exit(1);
  }

  const profileDesc =
    requestedProfiles.size > 0
      ? [...requestedProfiles].join(", ")
      : "default non-live suite";
  console.log(`Running ${selected.length} test file(s) across ${profileDesc}`);

  const runnerOpts: RunnerOptions = {
    timeoutMs: args.timeoutMs,
    concurrency: args.concurrency,
  };

  const runResult = await runAll(selected, runnerOpts);

  console.log("\n=== Results ===");
  for (const r of runResult.results) {
    const status = r.exitCode === 0 && !r.timedOut ? "PASS" : "FAIL";
    console.log(
      `  ${status}  ${r.testPath}  (${r.durationMs}ms, exit=${r.exitCode}, cleaned=${r.cleaned})`,
    );
  }
  console.log(
    `\n${runResult.passed} passed, ${runResult.failed} failed in ${runResult.durationMs}ms`,
  );

  process.exit(runResult.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
