#!/usr/bin/env node
/** One-shot Gmail test send on VPS (loads .env from cwd) */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, "..", "server");
process.chdir(serverDir);

const envPath = path.join(serverDir, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const { sendGmailTestEmail } = await import(
  path.join(serverDir, "dist", "notification", "smtp-gmail.js")
);
const to = (process.env.NOTIFICATION_TEST_TO ?? "").trim();
if (!to) {
  console.error("NOTIFICATION_TEST_TO unset");
  process.exit(1);
}
const result = await sendGmailTestEmail(to);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
