#!/usr/bin/env node
/** Open Explorer focused on the generated Play Console AAB. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  path.join(root, "play-console-upload", "TiSLY-com.tisly.app.aab"),
  path.join(root, "android", "app-release-bundle.aab"),
];
const aab = candidates.find((p) => fs.existsSync(p));
if (!aab) {
  console.error("[android:open-aab] AAB not found. Run: npm run build:android");
  process.exit(1);
}
const st = fs.statSync(aab);
console.log(`[android:open-aab] ${aab} (${st.size} bytes)`);
if (process.platform === "win32") {
  spawnSync("explorer.exe", ["/select,", aab], { stdio: "ignore" });
} else {
  console.log("[android:open-aab] Open this path in your file manager.");
}
