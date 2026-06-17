/**
 * manifest-icons.json の icons 配列を全 .webmanifest / manifest.json に反映
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const icons = JSON.parse(
  fs.readFileSync(path.join(publicDir, "icons", "manifest-icons.json"), "utf8")
);

const files = fs
  .readdirSync(publicDir)
  .filter((f) => f.endsWith(".webmanifest") || f === "manifest.json");

for (const file of files) {
  const full = path.join(publicDir, file);
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  json.icons = icons;
  fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`synced icons in ${file}`);
}
