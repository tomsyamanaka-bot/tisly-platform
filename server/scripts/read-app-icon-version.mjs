import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const tsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "pwa",
  "pwa-manifest-icons.ts"
);
const text = fs.readFileSync(tsPath, "utf8");
const m = text.match(/export const APP_ICON_VERSION = "(\d+)"/);
if (!m) throw new Error("APP_ICON_VERSION not found in pwa-manifest-icons.ts");
export const APP_ICON_VERSION = m[1];
