import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

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
    const fullPath = this.path;
    const fileName = fullPath.split("/").pop() ?? fullPath;
    return fileName.slice(0, fileName.length - ext.length);
  }

  private getExtension(): string {
    const fileName = this.path.split("/").pop() ?? this.path;
    const dotIdx = fileName.lastIndexOf(".");
    return dotIdx > 0 ? fileName.slice(dotIdx) : "";
  }
}
