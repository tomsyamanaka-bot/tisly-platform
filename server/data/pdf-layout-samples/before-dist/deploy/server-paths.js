/**
 * dist/ 実行時も server/src を正しく参照するパス解決
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export function getServerRoot() {
    return path.join(moduleDir, "..", "..");
}
/** TypeScript ソース（VPS では git pull 後 server/src が存在） */
export function getServerSrcDir() {
    const src = path.join(getServerRoot(), "src");
    if (fs.existsSync(src))
        return src;
    return path.join(moduleDir, "..");
}
export function getPublicDir() {
    return path.join(getServerRoot(), "public");
}
export function getRepoRoot() {
    return path.join(getServerRoot(), "..");
}
