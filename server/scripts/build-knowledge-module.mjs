/**
 * Knowledge モジュールをブラウザ向けにバンドル
 * Express PWA は静的配信のため esbuild で1ファイル化
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const entry = path.join(
  root,
  "public/js/features/knowledge/pages/index.tsx"
);
const outfile = path.join(
  root,
  "public/js/features/knowledge/knowledge-module.bundle.js"
);

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  outfile,
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  target: ["es2020", "chrome90", "safari14"],
  loader: { ".tsx": "tsx", ".ts": "ts" },
  logLevel: "info",
});

console.log("Knowledge module bundle:", outfile);
