/**
 * TiSLY HOME — タイルUI 化した HTML のタグ入れ子チェック
 * 手元検証用（ビルド対象外）
 */
import fs from "node:fs";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
  "!doctype",
]);

let failed = false;

for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, "utf-8");
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z!][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    const [, closing, rawName, selfClose] = match;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClose === "/") continue;
    if (closing) {
      const last = stack.pop();
      if (last !== name) {
        failed = true;
        console.error(
          `${file}: </${name}> が ${last ?? "(空)"} と対応していません`
        );
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length) {
    failed = true;
    console.error(`${file}: 閉じていないタグ ${stack.join(" > ")}`);
  } else if (!failed) {
    console.log(`${file}: OK`);
  }
}

process.exit(failed ? 1 : 0);
