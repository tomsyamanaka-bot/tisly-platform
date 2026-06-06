import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const files = fs.readdirSync(publicDir).filter((f) => f.endsWith(".html"));

for (const file of files) {
  const full = path.join(publicDir, file);
  let html = fs.readFileSync(full, "utf8");
  const before = html;
  html = html.replaceAll('href="/icons/icon-192.png"', 'href="/icons/icon-192.png?v=2001"');
  html = html.replaceAll('href="/icons/icon-128.png"', 'href="/icons/icon-128.png?v=2001"');
  html = html.replaceAll('href="/manifest.webmanifest"', 'href="/manifest.webmanifest?v=2001"');
  html = html.replaceAll(
    'href="/business/manifest.webmanifest"',
    'href="/business/manifest.webmanifest?v=2001"'
  );
  if (html !== before) {
    fs.writeFileSync(full, html, "utf8");
    console.log(`updated ${file}`);
  }
}
