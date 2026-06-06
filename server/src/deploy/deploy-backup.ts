/**
 * Phase 1461–1500 — デプロイ前バックアップ（.env / DB / uploads）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getDbPath } from "../db/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const repoRoot = path.join(serverRoot, "..");

export interface DeployBackupResult {
  ok: boolean;
  backupDir: string;
  files: string[];
  errors: string[];
}

function copyIfExists(src: string, dest: string, files: string[], errors: string[]): void {
  if (!fs.existsSync(src)) {
    errors.push(`missing: ${src}`);
    return;
  }
  try {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    files.push(dest);
  } catch (e) {
    errors.push(`${src}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function runDeployBackup(rootDir = repoRoot): DeployBackupResult {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(rootDir, "backup", stamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const files: string[] = [];
  const errors: string[] = [];

  const envPath = path.join(serverRoot, ".env");
  copyIfExists(envPath, path.join(backupDir, ".env"), files, errors);

  const dbPath = path.resolve(serverRoot, getDbPath());
  copyIfExists(dbPath, path.join(backupDir, "database", path.basename(dbPath)), files, errors);

  const uploadsPath = path.join(serverRoot, "uploads");
  copyIfExists(uploadsPath, path.join(backupDir, "uploads"), files, errors);

  const manifest = {
    generatedAt: new Date().toISOString(),
    phase: "1461-1500-conoha-vps-auto-deploy",
    publicUrl: config.publicUrl,
    files,
    errors,
  };
  const manifestPath = path.join(backupDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  files.push(manifestPath);

  return {
    ok: errors.length === 0,
    backupDir,
    files,
    errors,
  };
}
