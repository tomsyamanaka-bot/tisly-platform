import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** server/test または VPS cwd からリポジトリルートを解決（絶対/相対両対応） */
export function resolveRepoRoot(fromFile = import.meta.url): string {
  const fromTestDir = path.dirname(fileURLToPath(fromFile));
  const candidates: string[] = [];

  if (process.env.TISLY_REPO_ROOT) {
    candidates.push(path.resolve(process.env.TISLY_REPO_ROOT));
  }
  candidates.push(path.resolve(fromTestDir, "../.."));
  candidates.push(path.resolve(fromTestDir, ".."));
  candidates.push("/opt/tisly");

  const seen = new Set<string>();
  for (const root of candidates) {
    if (seen.has(root)) continue;
    seen.add(root);
    const script = path.join(root, "scripts/vps-production-start.sh");
    const serverPkg = path.join(root, "server/package.json");
    if (fs.existsSync(script) || fs.existsSync(serverPkg)) {
      return root;
    }
  }
  return path.resolve(fromTestDir, "../..");
}

export function resolveServerRoot(repoRoot: string): string {
  const primary = path.join(repoRoot, "server");
  if (fs.existsSync(path.join(primary, "package.json"))) return primary;
  if (fs.existsSync(path.resolve("package.json"))) return path.resolve(".");
  return primary;
}

/** scripts/vps-production-start.sh を repo root / 相対 cwd / VPS 既定パスから探索 */
export function resolveVpsProductionStartScript(repoRoot: string): string | null {
  const candidates = [
    path.join(repoRoot, "scripts/vps-production-start.sh"),
    path.resolve(repoRoot, "..", "scripts/vps-production-start.sh"),
    path.resolve("scripts/vps-production-start.sh"),
    "/opt/tisly/scripts/vps-production-start.sh",
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

/** vps-production-start.sh が systemd 本番起動を行うこと（実ファイル内容に合わせた判定） */
export function vpsProductionStartUsesSystemd(body: string): boolean {
  return (
    body.includes("systemctl daemon-reload") &&
    body.includes("systemctl enable") &&
    body.includes("systemctl restart") &&
    body.includes("SYSTEMD_UNIT")
  );
}
