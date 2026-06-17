import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APP_ICON_VERSION } from "./read-app-icon-version.mjs";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const v = APP_ICON_VERSION;
const iconV = `?v=${v}`;

const targets = [
  path.join(publicDir, "service-worker.js"),
  path.join(publicDir, "remote-test", "service-worker.js"),
  path.join(publicDir, "sw.js"),
  path.join(publicDir, "js", "departure-reminder.js"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  text = text.replace(/const ICON_V = "\?v=\d+";/, `const ICON_V = "${iconV}";`);
  text = text.replaceAll(/\?v=\d+/g, iconV);
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    console.log(`updated ${path.relative(publicDir, file)} (${iconV})`);
  }
}
