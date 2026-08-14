import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";

export class AuditLogger {
  private path: string;
  private maxSizeBytes: number;
  private maxFiles: number;

  constructor(path: string, maxSizeMB: number, maxFiles: number) {
    this.path = path;
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
    this.maxFiles = maxFiles;
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  write(entry: Record<string, unknown>): void {
    try {
      if (this.shouldRotate()) {
        this.rotate();
      }
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(this.path, line, { encoding: "utf-8" });
    } catch (err) {
      console.error(
        `[audit-logger] Failed to write audit entry: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  purgeOlderThan(hours: number): void {
    if (!existsSync(this.path)) return;
    try {
      const content = readFileSync(this.path, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return;

      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const kept: string[] = [];
      let purged = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { timestamp?: string };
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (Number.isNaN(ts) || ts >= cutoff) {
            kept.push(line);
          } else {
            purged++;
          }
        } catch {
          kept.push(line);
        }
      }

      if (purged === 0) return;
      writeFileSync(this.path, kept.join("\n") + "\n", { encoding: "utf-8" });
      console.log(
        `[audit-logger] Purged ${purged} entr${purged === 1 ? "y" : "ies"} older than ${hours}h`,
      );
    } catch (err) {
      console.error(
        `[audit-logger] Failed to purge audit log: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private shouldRotate(): boolean {
    if (!existsSync(this.path)) return false;
    try {
      const stats = statSync(this.path);
      return stats.size >= this.maxSizeBytes;
    } catch {
      return false;
    }
  }

  private rotate(): void {
    const dir = dirname(this.path);
    const base = this.path;

    // Delete oldest files exceeding retention limit
    const rotated = this.getRotatedFiles();
    while (rotated.length >= this.maxFiles) {
      const oldest = rotated.shift();
      if (oldest) {
        try {
          unlinkSync(oldest);
        } catch {
          // Ignore unlink failures
        }
      }
    }

    // Rename current log to timestamped name
    if (existsSync(base)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = this.getExtension();
      const name = this.getBaseName();
      const rotatedName = join(dir, `${name}.${ts}${ext}`);
      renameSync(base, rotatedName);
    }
  }

  private getRotatedFiles(): string[] {
    const dir = dirname(this.path);
    const baseName = this.getBaseName();
    const ext = this.getExtension();
    try {
      const files = readdirSync(dir);
      return files
        .filter((f) => f.startsWith(`${baseName}.`) && f.endsWith(ext))
        .map((f) => join(dir, f))
        .sort();
    } catch {
      return [];
    }
  }

  private getBaseName(): string {
    const ext = this.getExtension();
    return basename(this.path, ext);
  }

  private getExtension(): string {
    return extname(this.path);
  }
}
