/**
 * TiSLY 公式 PWA アイコン生成 — tisly-logo-source.png から各サイズを出力
 * 64 / 128 / 180 / 192 / 256 / 384 / 512 px + apple-touch-icon.png
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");
const publicDir = path.join(__dirname, "..", "public");
const sourcePath = path.join(outDir, "tisly-logo-source.png");
const SIZES = [64, 128, 180, 192, 256, 384, 512];
const BG = { r: 13, g: 17, b: 23, alpha: 1 };

async function renderIcon(size) {
  const logoScale = size <= 128 ? 0.92 : 0.88;
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, { fit: "contain", background: BG })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing source logo: ${sourcePath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const buf = await renderIcon(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
}

const apple180 = await renderIcon(180);
fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), apple180);

console.log(
  `Wrote TiSLY logo icons: ${SIZES.map((s) => `icon-${s}.png`).join(", ")}, apple-touch-icon.png`
);
