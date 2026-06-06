/** Copy SQLite/Postgres SQL assets into dist/db for production runtime */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const srcDb = path.join(serverRoot, "src", "db");
const distDb = path.join(serverRoot, "dist", "db");

function copySqlFiles(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copySqlFiles(src, path.join(destDir, name));
      continue;
    }
    if (name.endsWith(".sql")) {
      fs.copyFileSync(src, path.join(destDir, name));
    }
  }
}

copySqlFiles(srcDb, distDb);

const required = path.join(distDb, "schema.sql");
if (!fs.existsSync(required)) {
  console.error("copy-db-assets: missing dist/db/schema.sql");
  process.exit(1);
}

console.log("copy-db-assets: dist/db/*.sql OK");
