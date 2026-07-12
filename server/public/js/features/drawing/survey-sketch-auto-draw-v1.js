/**
 * 現調スケッチ送信ヘルパー v1
 * （旧 Canny / OpenCV 端末内検出は撤廃）
 * Gemini Vision SVG 経路の FormData 準備のみ残す
 */

/**
 * AI作図送信用に JPEG File を明示生成
 * @param {Blob} file
 */
export async function prepareSketchUploadFileV1(file) {
  const fallbackType =
    file?.type && String(file.type).startsWith("image/")
      ? file.type
      : "image/jpeg";
  let bitmap = null;
  try {
    if (typeof createImageBitmap !== "function") {
      throw new Error("no bitmap");
    }
    bitmap = await createImageBitmap(file);
    const maxEdge = 1500;
    const scale =
      Math.max(bitmap.width, bitmap.height) > maxEdge
        ? maxEdge / Math.max(bitmap.width, bitmap.height)
        : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no ctx");
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.92
      );
    });
    return new File([blob], "sketch.jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error(err);
    console.warn("[sketch-upload] prepare fallback", err);
    return new File([file], "sketch.jpg", { type: fallbackType });
  } finally {
    try {
      bitmap?.close?.();
    } catch (closeErr) {
      console.error(closeErr);
    }
  }
}

/**
 * sketch not found 系メッセージか判定
 * @param {unknown} err
 */
export function isSketchNotFoundError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return /sketch not found|not found/.test(msg);
}
