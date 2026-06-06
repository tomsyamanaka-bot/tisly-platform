import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = fs
  .readdirSync(publicDir)
  .filter((f) => f.endsWith(".webmanifest") || f === "manifest.json");

for (const file of files) {
  const full = path.join(publicDir, file);
  let text = fs.readFileSync(full, "utf8");
  const before = text;
  text = text.replaceAll('"/icons/icon-64.png"', '"/icons/icon-64.png?v=2001"');
  text = text.replaceAll('"/icons/icon-128.png"', '"/icons/icon-128.png?v=2001"');
  text = text.replaceAll('"/icons/icon-192.png"', '"/icons/icon-192.png?v=2001"');
  text = text.replaceAll('"/icons/icon-256.png"', '"/icons/icon-256.png?v=2001"');
  text = text.replaceAll('"/icons/icon-384.png"', '"/icons/icon-384.png?v=2001"');
  text = text.replaceAll('"/icons/icon-512.png"', '"/icons/icon-512.png?v=2001"');
  if (text !== before) {
    fs.writeFileSync(full, text, "utf8");
    console.log(`updated ${file}`);
  }
}
