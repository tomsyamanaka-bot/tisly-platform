/**
 * お客様向け PDF を File として共有（Web Share API files）。
 * 非対応時はダウンロード / URL コピーにフォールバック。
 */

const PDF_FAIL_MSG = "PDF生成に失敗しました。再生成してください";
const PDF_MIN_CLIENT_BYTES = 10000;

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isValidPdfBlob(blob) {
  return blob && blob.size >= PDF_MIN_CLIENT_BYTES && blob.type !== "text/html";
}

async function readResponseErrorDetail(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return data.error || data.message || null;
  }
  const text = await res.text().catch(() => "");
  return text.trim().slice(0, 160) || null;
}

async function validatePdfBlob(blob, res) {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    return "Content-Type不正: HTMLが返されました（PDF APIを使用してください）";
  }
  if (!contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    return `Content-Type不正: ${contentType || "不明"}`;
  }
  if (!blob || blob.size < PDF_MIN_CLIENT_BYTES) {
    return `PDFサイズ不足: ${blob?.size ?? 0} byte（${PDF_MIN_CLIENT_BYTES} byte以上が必要）`;
  }
  const headBuf = await blob.slice(0, 5).arrayBuffer();
  const head = new TextDecoder("ascii").decode(headBuf);
  if (head !== "%PDF-") {
    return "PDFヘッダー不正: 先頭が %PDF ではありません";
  }
  return null;
}

function describeHttpPdfError(status, detail) {
  if (status === 404) return `PDF API 404${detail ? `: ${detail}` : ""}`;
  if (status === 500) return `PDF API 500${detail ? `: ${detail}` : ""}`;
  if (status === 403) return `PDF API 403${detail ? `: ${detail}` : ""}`;
  return `PDF API ${status}${detail ? `: ${detail}` : ""}`;
}

/**
 * PDF API から application/pdf を取得し実体を検証する。
 * @throws {Error} 原因付きメッセージ
 */
async function fetchPdfBlob(fetchUrl, headers = {}) {
  const res = await fetch(fetchUrl, { headers });
  if (!res.ok) {
    const detail = await readResponseErrorDetail(res);
    throw new Error(describeHttpPdfError(res.status, detail));
  }
  const blob = await res.blob();
  const validationError = await validatePdfBlob(blob, res);
  if (validationError) {
    if (validationError.includes("サイズ不足") || validationError.includes("ヘッダー")) {
      throw new Error(validationError);
    }
    throw new Error(validationError);
  }
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "application/pdf";
  return new Blob([blob], { type });
}

/** 自動再生成すべき取得失敗か */
function shouldAutoRegeneratePdf(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("PDF API 404") ||
    msg.includes("PDF API 500") ||
    msg.includes("PDFサイズ不足") ||
    msg.includes("Content-Type不正") ||
    msg.includes("PDFヘッダー不正") ||
    msg.includes("HTMLが返されました")
  );
}

/**
 * 再生成URLがあれば1回だけ再生成してから PDF を取得する。
 * @param {object} opts
 * @param {string} opts.fetchUrl
 * @param {Record<string, string>} [opts.headers]
 * @param {string|null} [opts.regenerateUrl]
 * @param {() => Record<string, string>} [opts.getRegenerateHeaders]
 */
async function fetchPdfBlobWithRegenerate({ fetchUrl, headers = {}, regenerateUrl, getRegenerateHeaders }) {
  try {
    return await fetchPdfBlob(fetchUrl, headers);
  } catch (e) {
    if (!regenerateUrl || !shouldAutoRegeneratePdf(e)) throw e;
    const regHeaders = getRegenerateHeaders?.() ?? headers;
    const regRes = await fetch(regenerateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...regHeaders },
      body: "{}",
    });
    if (!regRes.ok) {
      const detail = await readResponseErrorDetail(regRes);
      throw new Error(detail ? `PDF再生成失敗: ${detail}` : "PDF再生成に失敗しました");
    }
    return await fetchPdfBlob(fetchUrl, headers);
  }
}

function canShareFiles(file) {
  if (!navigator.share) return false;
  if (typeof navigator.canShare === "function") {
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * @param {object} opts
 * @param {string} opts.fetchUrl — PDF取得URL（認証付き）
 * @param {string} opts.fileName — 共有ファイル名（例: estimate-260613-001.pdf）
 * @param {string} [opts.title] — 共有ダイアログタイトル
 * @param {() => Record<string, string>} [opts.getHeaders] — Authorization 等
 * @param {string|null} [opts.regenerateUrl]
 * @param {(msg: string) => void} [opts.toast]
 * @returns {Promise<'share-files'|'download'|'url-copy'>}
 */
export async function sharePdfAsFile({ fetchUrl, fileName, title, getHeaders, regenerateUrl, toast }) {
  const headers = getHeaders?.() ?? {};
  const pdfBlob = await fetchPdfBlobWithRegenerate({
    fetchUrl,
    headers,
    regenerateUrl,
    getRegenerateHeaders: getHeaders,
  });
  const safeName = (fileName || "document.pdf").replace(/[/\\:*?"<>|]/g, "_");
  const file = new File([pdfBlob], safeName, { type: "application/pdf" });

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: title || safeName });
      return "share-files";
    } catch (e) {
      if (e?.name === "AbortError") throw e;
    }
  }

  triggerDownload(pdfBlob, safeName);
  toast?.("PDFをダウンロードしました（共有アプリから送れます）");
  return "download";
}

/** URL共有フォールバック（HTMLプレビュー等で File 共有不可の場合） */
export async function copyPdfShareUrl(url, toast) {
  try {
    await navigator.clipboard.writeText(url);
    toast?.("URLをコピーしました");
    return "url-copy";
  } catch {
    prompt("共有URL（コピーしてください）", url);
    return "url-copy";
  }
}

export {
  fetchPdfBlob,
  fetchPdfBlobWithRegenerate,
  triggerDownload,
  PDF_FAIL_MSG,
  isValidPdfBlob,
  shouldAutoRegeneratePdf,
  validatePdfBlob,
};
