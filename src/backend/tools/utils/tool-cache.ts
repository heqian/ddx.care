import { createHash } from "node:crypto";
import { Database, type Statement } from "bun:sqlite";
import { logger } from "../../utils/logger";
import { TOOL_CACHE_ENABLED, TOOL_CACHE_TTL_MS } from "../../config";

const getDbPath = () => process.env.TOOL_CACHE_DB_PATH || "tool-cache.sqlite";

let db: Database;
let getStmt: Statement;
let setStmt: Statement;
let cleanupStmt: Statement;
let countStmt: Statement;

let hits = 0;
let misses = 0;

/**
 * Cache keys are SHA-256 hashes of the request URL, never the URL itself —
 * URLs carry PHI-derived terms (drug names, conditions) as query parameters,
 * so storing or logging them raw would put PHI at rest and in logs.
 */
export function cacheKeyForUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function migrateOldSchema(database: Database): void {
  const columns = database
    .query("SELECT name FROM pragma_table_info('tool_cache')")
    .all() as Array<{ name: string }>;
  // The pre-hash schema stored raw URLs — drop it once so no PHI-derived
  // keys persist on disk. The cache is disposable; it refills organically.
  if (columns.length > 0 && columns.some((c) => c.name === "url")) {
    database.exec("DROP TABLE tool_cache");
    logger.warn("tool_cache_legacy_schema_dropped", {});
  }
}

export function initToolCache(): void {
  if (!TOOL_CACHE_ENABLED) return;

  try {
    const database = new Database(getDbPath(), { create: true });
    database.exec("PRAGMA journal_mode=WAL;");

    migrateOldSchema(database);

    database.exec(`
      CREATE TABLE IF NOT EXISTS tool_cache (
        cache_key TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_cache_fetched_at ON tool_cache (fetched_at);
    `);

    getStmt = database.prepare(
      "SELECT response, fetched_at FROM tool_cache WHERE cache_key = ?",
    );
    setStmt = database.prepare(
      "INSERT OR REPLACE INTO tool_cache (cache_key, response, fetched_at) VALUES (?, ?, ?)",
    );
    cleanupStmt = database.prepare(
      "DELETE FROM tool_cache WHERE fetched_at < ?",
    );
    countStmt = database.prepare("SELECT COUNT(*) as count FROM tool_cache");

    db = database;
    // Purge entries that expired while the server was down.
    cleanupExpired();
    logger.info("tool_cache_init", { path: getDbPath() });
  } catch (error: unknown) {
    db = undefined as unknown as Database;
    logger.warn("tool_cache_init_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getCached(url: string): unknown | null {
  if (!TOOL_CACHE_ENABLED || !db) return null;

  const row = getStmt.get(cacheKeyForUrl(url)) as {
    response: string;
    fetched_at: number;
  } | null;

  if (!row) {
    misses++;
    return null;
  }

  if (Date.now() - row.fetched_at > TOOL_CACHE_TTL_MS) {
    misses++;
    return null;
  }

  hits++;
  try {
    return JSON.parse(row.response);
  } catch {
    return null;
  }
}

export function setCached(url: string, response: unknown): void {
  if (!TOOL_CACHE_ENABLED || !db) return;

  setStmt.run(cacheKeyForUrl(url), JSON.stringify(response), Date.now());
}

export function cleanupExpired(): number {
  if (!TOOL_CACHE_ENABLED || !db) return 0;

  const cutoff = Date.now() - TOOL_CACHE_TTL_MS;
  const result = cleanupStmt.run(cutoff);
  logger.info("tool_cache_cleanup", { removed: result.changes });
  return result.changes;
}

export function getCacheStats(): {
  entries: number;
  hits: number;
  misses: number;
} {
  if (!TOOL_CACHE_ENABLED || !db) {
    return { entries: 0, hits: 0, misses: 0 };
  }

  const count = (countStmt.get() as { count: number }).count;
  return { entries: count, hits, misses };
}

export function resetToolCache(): void {
  hits = 0;
  misses = 0;
  if (!db) return;
  try {
    db.exec("DELETE FROM tool_cache");
  } catch {
    // ignore if DB not initialized
  }
}
