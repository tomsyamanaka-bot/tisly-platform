#!/usr/bin/env node
/**
 * 豊島邸 RP2350 USB 一発フラッシュ（Node ラッパー）
 *
 * COM / ttyACM を自動検出し、tools/flash_rp2350.py を起動する。
 * 例: node scripts/flash_toyoshima_rp2350.js --building main
 */

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const py = path.join(root, "tools", "flash_rp2350.py");

const args = process.argv.slice(2);
const cmd = process.platform === "win32" ? "python" : "python3";

console.log("[豊島邸] RP2350 USB 自動書き込みを開始します");
const result = spawnSync(cmd, [py, ...args], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error("[豊島邸] error:", result.error.message);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
