import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getPlatformSetting } from "../db/database.js";

const ARCHIVE_DIR = path.join(process.cwd(), "data", "qnap-archive");

export type RetentionDays = 30 | 90 | 365;

export function getRetentionPolicy(): {
  days: RetentionDays;
  options: RetentionDays[];
  archiveDir: string;
} {
  const setting = getPlatformSetting<{ days: number; options: number[] }>("retention");
  const days = (setting?.days ?? 90) as RetentionDays;
  const options = (setting?.options ?? [30, 90, 365]) as RetentionDays[];
  return { days, options, archiveDir: ARCHIVE_DIR };
}

function listArchiveFiles(): Array<{ path: string; mtimeMs: number; size: number }> {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  const out: Array<{ path: string; mtimeMs: number; size: number }> = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else out.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  };
  walk(ARCHIVE_DIR);
  return out;
}

export function purgeArchives(opts: {
  retentionDays: RetentionDays;
  dryRun: boolean;
}): {
  retentionDays: number;
  dryRun: boolean;
  candidates: number;
  deleted: number;
  freedBytes: number;
  files: string[];
} {
  const cutoff = Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000;
  const files = listArchiveFiles().filter((f) => f.mtimeMs < cutoff);
  let freedBytes = 0;
  const deletedPaths: string[] = [];

  if (!opts.dryRun) {
    for (const f of files) {
      try {
        fs.unlinkSync(f.path);
        freedBytes += f.size;
        deletedPaths.push(f.path);
      } catch {
        /* skip locked files */
      }
    }
    const db = getDatabase();
    const id = uuid();
    db.prepare(
      `INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
       VALUES (?, 'purge', 'log', ?, ?, datetime('now'))`
    ).run(id, `purge-${opts.retentionDays}d`, deletedPaths.length);
  }

  return {
    retentionDays: opts.retentionDays,
    dryRun: opts.dryRun,
    candidates: files.length,
    deleted: opts.dryRun ? 0 : deletedPaths.length,
    freedBytes: opts.dryRun ? 0 : freedBytes,
    files: files.map((f) => f.path),
  };
}
