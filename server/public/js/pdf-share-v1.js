/**
 * お客様向け PDF を File として共有（Web Share API files）。
 * 非対応時はダウンロード / URL コピーにフォールバック。
 */

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

async function fetchPdfBlob(fetchUrl, headers = {}) {
  const res = await fetch(fetchUrl, { headers });
  if (!res.ok) {
    throw new Error("PDFの取得に失敗しました");
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("PDFが未生成です。PDF再作成を実行してください");
  }
  const blob = await res.blob();
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "application/pdf";
  return new Blob([blob], { type });
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
 * @param {(msg: string) => void} [opts.toast]
 * @returns {Promise<'share-files'|'download'|'url-copy'>}
 */
export async function sharePdfAsFile({ fetchUrl, fileName, title, getHeaders, toast }) {
  const headers = getHeaders?.() ?? {};
  const pdfBlob = await fetchPdfBlob(fetchUrl, headers);
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

export { fetchPdfBlob, triggerDownload };
