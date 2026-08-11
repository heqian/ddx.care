/**
 * CLI argument parsing and validation for the test runner.
 *
 * The CLI must reject unknown options, missing values, invalid numeric
 * values, and empty selections before execution.
 */

export interface CliArgs {
  profiles: Set<string>;
  liveIntegration: boolean;
  liveContract: boolean;
  concurrency: number;
  timeoutMs: number;
  validate: boolean;
  list: boolean;
  help: boolean;
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    profiles: new Set(),
    liveIntegration: false,
    liveContract: false,
    concurrency: 1,
    timeoutMs: 120_000,
    validate: false,
    list: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--profile": {
        const value = argv[i + 1];
        if (!value) throw new CliError("--profile requires a value");
        args.profiles.add(value);
        i++;
        break;
      }
      case "--live-integration":
        args.liveIntegration = true;
        break;
      case "--live-contract":
        args.liveContract = true;
        break;
      case "--concurrency": {
        const value = argv[i + 1];
        if (!value) throw new CliError("--concurrency requires a value");
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0 || n > 64) {
          throw new CliError(
            `Invalid --concurrency: ${value}. Must be a positive integer between 1 and 64.`,
          );
        }
        args.concurrency = n;
        i++;
        break;
      }
      case "--timeout": {
        const value = argv[i + 1];
        if (!value) throw new CliError("--timeout requires a value");
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0 || n > 3_600_000) {
          throw new CliError(
            `Invalid --timeout: ${value}. Must be a positive integer between 1 and 3600000.`,
          );
        }
        args.timeoutMs = n;
        i++;
        break;
      }
      case "--validate":
        args.validate = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new CliError(`Unknown argument: ${arg}`);
    }
  }

  return args;
}
