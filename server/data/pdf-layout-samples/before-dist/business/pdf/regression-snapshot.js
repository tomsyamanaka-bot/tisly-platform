import crypto from "crypto";
import fs from "fs";
import path from "path";
const SNAPSHOT_DIR = path.join(process.cwd(), "test", "fixtures", "pdf-snapshots");
export function pdfSnapshotPath(name) {
    return path.join(SNAPSHOT_DIR, `${name}.hash`);
}
export function hashBuffer(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex");
}
export function comparePdfSnapshot(name, buf, threshold = 0) {
    const snapPath = pdfSnapshotPath(name);
    const hash = hashBuffer(buf);
    if (!fs.existsSync(snapPath)) {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        fs.writeFileSync(snapPath, hash, "utf8");
        return { match: true, diffRatio: 0 };
    }
    const expected = fs.readFileSync(snapPath, "utf8").trim();
    if (expected === hash)
        return { match: true, diffRatio: 0 };
    return { match: threshold >= 1, diffRatio: 1 };
}
export async function comparePdfPixels(name, pngA, pngB, threshold = 0.02) {
    try {
        const pixelmatch = (await import("pixelmatch")).default;
        const { PNG } = (await import("pngjs"));
        const a = PNG.sync.read(pngA);
        const b = PNG.sync.read(pngB);
        if (a.width !== b.width || a.height !== b.height) {
            return { match: false, diffRatio: 1, usedPixelmatch: true };
        }
        const diffPixels = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
        const ratio = diffPixels / (a.width * a.height);
        return { match: ratio <= threshold, diffRatio: ratio, usedPixelmatch: true };
    }
    catch {
        return { match: hashBuffer(pngA) === hashBuffer(pngB), diffRatio: 0, usedPixelmatch: false };
    }
}
