import { test, expect, describe } from "bun:test";
import { parseCliArgs, CliError } from "./cli";

describe("CLI validation (10.12)", () => {
  test("parses valid --profile", () => {
    const args = parseCliArgs(["--profile", "hermetic-bun"]);
    expect(args.profiles.has("hermetic-bun")).toBe(true);
  });

  test("parses multiple --profile", () => {
    const args = parseCliArgs([
      "--profile",
      "hermetic-bun",
      "--profile",
      "server-test",
    ]);
    expect(args.profiles.size).toBe(2);
  });

  test("parses --live-integration", () => {
    const args = parseCliArgs(["--live-integration"]);
    expect(args.liveIntegration).toBe(true);
  });

  test("parses --live-contract", () => {
    const args = parseCliArgs(["--live-contract"]);
    expect(args.liveContract).toBe(true);
  });

  test("parses --concurrency with valid value", () => {
    const args = parseCliArgs(["--concurrency", "4"]);
    expect(args.concurrency).toBe(4);
  });

  test("parses --timeout with valid value", () => {
    const args = parseCliArgs(["--timeout", "60000"]);
    expect(args.timeoutMs).toBe(60000);
  });

  test("parses --validate", () => {
    const args = parseCliArgs(["--validate"]);
    expect(args.validate).toBe(true);
  });

  test("parses --list", () => {
    const args = parseCliArgs(["--list"]);
    expect(args.list).toBe(true);
  });

  test("parses --help", () => {
    const args = parseCliArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  test("rejects unknown argument", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(CliError);
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown argument");
  });

  test("rejects --profile without value", () => {
    expect(() => parseCliArgs(["--profile"])).toThrow(CliError);
    expect(() => parseCliArgs(["--profile"])).toThrow("requires a value");
  });

  test("rejects --concurrency without value", () => {
    expect(() => parseCliArgs(["--concurrency"])).toThrow(CliError);
  });

  test("rejects invalid --concurrency (non-integer)", () => {
    expect(() => parseCliArgs(["--concurrency", "abc"])).toThrow(CliError);
  });

  test("rejects invalid --concurrency (zero)", () => {
    expect(() => parseCliArgs(["--concurrency", "0"])).toThrow(CliError);
  });

  test("rejects invalid --concurrency (negative)", () => {
    expect(() => parseCliArgs(["--concurrency", "-1"])).toThrow(CliError);
  });

  test("rejects invalid --concurrency (too large)", () => {
    expect(() => parseCliArgs(["--concurrency", "100"])).toThrow(CliError);
  });

  test("rejects --timeout without value", () => {
    expect(() => parseCliArgs(["--timeout"])).toThrow(CliError);
  });

  test("rejects invalid --timeout (zero)", () => {
    expect(() => parseCliArgs(["--timeout", "0"])).toThrow(CliError);
  });

  test("defaults to concurrency=1 and timeout=120000", () => {
    const args = parseCliArgs([]);
    expect(args.concurrency).toBe(1);
    expect(args.timeoutMs).toBe(120_000);
  });
});
