import { logger } from "./logger";

interface RateLimitEntry {
  timestamps: number[];
}

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private clients = new Map<string, RateLimitEntry>();
  private activeCount = 0;
  private maxConcurrent: number;
  private hasLoggedReset = false;

  constructor(opts: {
    maxRequests: number;
    windowMs: number;
    maxConcurrent: number;
  }) {
    this.maxRequests = opts.maxRequests;
    this.windowMs = opts.windowMs;
    this.maxConcurrent = opts.maxConcurrent;
  }

  check(
    ip: string,
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    if (!this.hasLoggedReset) {
      logger.warn("rate_limiter_reset", {
        message: "Rate limiter state was reset due to server startup",
      });
      this.hasLoggedReset = true;
    }

    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.clients.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      this.clients.set(ip, entry);
    }

    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  record(ip: string): void {
    const entry = this.clients.get(ip);
    if (entry) {
      entry.timestamps.push(Date.now());
    }
  }

  get activeWorkflows(): number {
    return this.activeCount;
  }

  canStartWorkflow(): boolean {
    return this.activeCount < this.maxConcurrent;
  }

  startWorkflow(): void {
    this.activeCount++;
  }

  finishWorkflow(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  prune(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [ip, entry] of this.clients) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.clients.delete(ip);
      }
    }
  }
}
