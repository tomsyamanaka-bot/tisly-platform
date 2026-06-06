import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APP_ICON_VERSION } from "./read-app-icon-version.mjs";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = fs
  .readdirSync(publicDir)
  .filter((f) => f.endsWith(".webmanifest") || f === "manifest.json");

const sizes = [64, 128, 192, 256, 384, 512];

for (const file of files) {
  const full = path.join(publicDir, file);
  let text = fs.readFileSync(full, "utf8");
  const before = text;
  for (const size of sizes) {
    const bare = `"/icons/icon-${size}.png"`;
    const versioned = `"/icons/icon-${size}.png?v=${APP_ICON_VERSION}"`;
    text = text.replaceAll(bare, versioned);
    const oldV = text.match(new RegExp(`"/icons/icon-${size}\\.png\\?v=\\d+"`, "g"));
    if (oldV) {
      for (const match of oldV) {
        if (match !== `"${versioned.slice(1, -1)}"`) {
          text = text.replaceAll(match, versioned);
        }
      }
    }
  }
  if (text !== before) {
    fs.writeFileSync(full, text, "utf8");
    console.log(`updated ${file} (v=${APP_ICON_VERSION})`);
  }
}
