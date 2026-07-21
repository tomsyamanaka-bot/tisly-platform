/**
 * お客様向け PDF を File として共有（Web Share API files）。
 * HTML プレビュー URL（document-viewer-v1.html 等）の共有は禁止。
 * 非対応時は PDF ダウンロードのみ（URL 共有フォールバックなし）。
 */

const PDF_FAIL_MSG = "PDF生成に失敗しました。再生成してください";
const PDF_MIN_CLIENT_BYTES = 10000;

/** iOS 共有シートで LINE が出ない場合の案内（共有ボタン押下時に表示） */
export const LINE_SHARE_HINT =
  "LINEが出ない場合は、まず「ファイルに保存」してからLINEの＋ → ファイルで送信してください";

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

function logPdfFetchDebug(fetchUrl, res, blob) {
  const contentType = res.headers.get("content-type") || "";
  const contentLength = res.headers.get("content-length") || String(blob?.size ?? 0);
  const headPromise = blob
    ? blob.slice(0, 20).arrayBuffer().then((buf) => new TextDecoder("ascii").decode(buf))
    : Promise.resolve("");
  return headPromise.then((head20) => {
    console.log(
      "[PDF DEBUG]",
      JSON.stringify({
        url: fetchUrl,
        status: res.status,
        contentType,
        contentLength,
        head20,
      })
    );
  });
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

function describeHttpPdfError(status, detail, fetchUrl) {
  const urlPart = fetchUrl ? ` URL: ${fetchUrl}` : "";
  const bodyPart = detail ? ` body: ${detail}` : "";
  if (status === 404) return `PDF API 404${bodyPart}${urlPart}`;
  if (status === 500) return `PDF API 500${bodyPart}${urlPart}`;
  if (status === 403) return `PDF API 403${bodyPart}${urlPart}`;
  if (status === 401) return `PDF API 401${bodyPart}${urlPart}`;
  return `PDF API ${status}${bodyPart}${urlPart}`;
}

/** 見積・請求 PDF は写真なしクエリを付与（VPS 500 防止） */
export function normalizePdfFetchUrl(fetchUrl) {
  if (!fetchUrl || typeof fetchUrl !== "string") return fetchUrl;
  if (!fetchUrl.includes("/api/estimate/v1/projects/")) return fetchUrl;
  const isEstimate = /\/pdf(?:\?|$)/.test(fetchUrl) && !fetchUrl.includes("/invoice/pdf");
  const isInvoice = fetchUrl.includes("/invoice/pdf");
  if (!isEstimate && !isInvoice) return fetchUrl;
  if (/[?&]includePhotos=/.test(fetchUrl)) return fetchUrl;
  const sep = fetchUrl.includes("?") ? "&" : "?";
  return `${fetchUrl}${sep}includePhotos=false`;
}

/**
 * PDF API から application/pdf を取得し実体を検証する。
 * @throws {Error} 原因付きメッセージ
 */
async function fetchPdfBlob(fetchUrl, headers = {}) {
  assertPdfApiFetchUrl(fetchUrl);
  const url = normalizePdfFetchUrl(fetchUrl);
  const res = await fetch(url, { headers });
  const blob = res.ok ? await res.blob() : null;
  await logPdfFetchDebug(url, res, blob);
  if (!res.ok) {
    const detail = await readResponseErrorDetail(res);
    throw new Error(describeHttpPdfError(res.status, detail, url));
  }
  const validationError = await validatePdfBlob(blob, res);
  if (validationError) {
    const ct = res.headers.get("content-type") || "";
    const cl = res.headers.get("content-length") || String(blob?.size ?? 0);
    throw new Error(`${validationError} URL: ${url} status: ${res.status} content-type: ${ct} content-length: ${cl}`);
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
      throw new Error(
        detail
          ? `PDF再生成失敗 (${regRes.status}): ${detail} URL: ${regenerateUrl}`
          : `PDF再生成失敗 (${regRes.status}) URL: ${regenerateUrl}`
      );
    }
    return await fetchPdfBlob(fetchUrl, headers);
  }
}

function isForbiddenShareUrl(url) {
  if (!url || typeof url !== "string") return true;
  if (url.includes("document-viewer-v1.html")) return true;
  if (/\.html(?:\?|$)/i.test(url)) return true;
  if (typeof window !== "undefined" && url === window.location.href) return true;
  return false;
}

/** PDF 共有・取得は estimate/projects PDF API のみ許可 */
export function assertPdfApiFetchUrl(fetchUrl) {
  if (!fetchUrl || typeof fetchUrl !== "string") {
    throw new Error("PDF API URLが不正です");
  }
  if (isForbiddenShareUrl(fetchUrl)) {
    throw new Error("HTML URLは共有できません。PDF APIを使用してください");
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

function pdfFileFromBlob(pdfBlob, fileName) {
  const safeName = (fileName || "document.pdf").replace(/[/\\:*?"<>|]/g, "_");
  return new File([pdfBlob], safeName, { type: "application/pdf" });
}

/** 共有前に DOM 上の blob: URL を除去（LINE が iframe src をテキスト送信するのを防ぐ） */
export function clearBlobUrlsFromPage() {
  document.querySelectorAll('[src^="blob:"]').forEach((el) => {
    if (el.tagName === "IFRAME" || el.tagName === "EMBED") {
      el.setAttribute("src", "about:blank");
    } else {
      el.removeAttribute("src");
    }
  });
  document.querySelectorAll('a[href^="blob:"]').forEach((a) => {
    a.removeAttribute("href");
  });
  document.querySelectorAll('link[href^="blob:"]').forEach((link) => {
    link.remove();
  });
}

/**
 * Web Share API — files のみ（text / url / title は絶対に付与しない）
 * @param {File} file
 */
export async function navigatorShareFilesOnly(file) {
  clearBlobUrlsFromPage();
  const sharePayload = { files: [file] };
  if (typeof navigator.canShare === "function" && !navigator.canShare(sharePayload)) {
    throw new Error("この端末ではPDFファイル共有に対応していません");
  }
  await navigator.share(sharePayload);
}

/**
 * 取得済み PDF Blob を即座に File 共有（iOS ユーザージェスチャー維持用）。
 * navigator.share には files のみ渡す（url / title 禁止 — LINE が HTML URL を送るのを防ぐ）。
 */
export async function sharePdfBlobAsFile(pdfBlob, fileName, toast, { showHint = true } = {}) {
  if (!isValidPdfBlob(pdfBlob)) {
    throw new Error(PDF_FAIL_MSG);
  }
  const file = pdfFileFromBlob(pdfBlob, fileName);

  if (showHint) {
    toast?.(LINE_SHARE_HINT, { durationMs: 4500 });
  }

  if (canShareFiles(file)) {
    try {
      await navigatorShareFilesOnly(file);
      return "share-files";
    } catch (e) {
      if (e?.name === "AbortError") throw e;
    }
  }

  triggerDownload(pdfBlob, file.name);
  toast?.("PDFをファイルに保存しました。LINEの＋ → ファイルから送信できます");
  return "download";
}

/** application/pdf Blob を新しいタブで開く（API URL 直開きは使わない） */
export function openPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** iPhone Safari / PWA — blob URL では PDF を開けないため直接 URL を使う */
export function isIosPdfViewer() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios;
}

/** iOS Safari / PWA 向け: 認証付き PDF API URL を直接開く */
export function openPdfUrlDirect(fetchUrl) {
  const url = normalizePdfFetchUrl(fetchUrl);
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    window.location.assign(url);
  }
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
const prefetchPdfCache = new Map();

/** ヘッダー日付変更後など、古い PDF 先読みを破棄する */
export function clearPrefetchPdfCache() {
  prefetchPdfCache.clear();
}

/** 共有ボタン touchstart 等で先読み（iOS ユーザージェスチャー切れ防止） */
export function prefetchPdfForShare({ fetchUrl, getHeaders, regenerateUrl }) {
  assertPdfApiFetchUrl(fetchUrl);
  if (!prefetchPdfCache.has(fetchUrl)) {
    const headers = getHeaders?.() ?? {};
    const promise = fetchPdfBlobWithRegenerate({
      fetchUrl,
      headers,
      regenerateUrl,
      getRegenerateHeaders: getHeaders,
    }).catch((e) => {
      prefetchPdfCache.delete(fetchUrl);
      throw e;
    });
    prefetchPdfCache.set(fetchUrl, promise);
  }
  return prefetchPdfCache.get(fetchUrl);
}

export async function sharePdfAsFile({ fetchUrl, fileName, title, getHeaders, regenerateUrl, toast, pdfBlob }) {
  assertPdfApiFetchUrl(fetchUrl);
  const resolvedBlob =
    pdfBlob && isValidPdfBlob(pdfBlob)
      ? pdfBlob
      : await prefetchPdfForShare({ fetchUrl, getHeaders, regenerateUrl });
  return sharePdfBlobAsFile(resolvedBlob, fileName || title, toast);
}

export {
  fetchPdfBlob,
  fetchPdfBlobWithRegenerate,
  // prefetch cache clearer は上で export function 済み — 二重 export 禁止（estimate-v1 が SyntaxError で起動不能になる）
  triggerDownload,
  PDF_FAIL_MSG,
  isValidPdfBlob,
  shouldAutoRegeneratePdf,
  validatePdfBlob,
  logPdfFetchDebug,
};
