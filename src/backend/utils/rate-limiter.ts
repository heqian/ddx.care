import { logger } from "./logger";

interface RateLimitEntry {
  timestamps: number[];
}

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private clients = new Map<string, RateLimitEntry>();
  private insertionOrder: string[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private maxEntries: number;
  private hasLoggedReset = false;

  constructor(opts: {
    maxRequests: number;
    windowMs: number;
    maxConcurrent: number;
    maxEntries?: number;
  }) {
    this.maxRequests = opts.maxRequests;
    this.windowMs = opts.windowMs;
    this.maxConcurrent = opts.maxConcurrent;
    this.maxEntries = opts.maxEntries ?? Infinity;
  }

  private evictOldest(): void {
    while (
      this.insertionOrder.length > 0 &&
      this.clients.size >= this.maxEntries
    ) {
      const oldest = this.insertionOrder.shift()!;
      if (this.clients.has(oldest)) {
        this.clients.delete(oldest);
        return;
      }
    }
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
      if (this.clients.size >= this.maxEntries) {
        this.evictOldest();
      }
      entry = { timestamps: [] };
      this.clients.set(ip, entry);
      this.insertionOrder.push(ip);
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
    const remaining: string[] = [];
    for (let i = 0; i < this.insertionOrder.length; i++) {
      const ip = this.insertionOrder[i]!;
      const entry = this.clients.get(ip);
      if (!entry) continue;
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.clients.delete(ip);
      } else {
        remaining.push(ip);
      }
    }
    this.insertionOrder = remaining;
  }
}
