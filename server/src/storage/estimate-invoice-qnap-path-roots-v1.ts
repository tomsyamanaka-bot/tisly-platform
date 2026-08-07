/**
 * 見積・請求 PDF — QNAP 保存パス候補（/TiSLY → /Public/TiSLY フォールバック）
 */
import {
  buildInvoicesEstimatesAbsolutePathV1,
  buildInvoicesEstimatesBackupRelativePathV1,
  buildInvoicesEstimatesPublicRelativePathV1,
  INVOICES_ESTIMATES_BACKUP_ROOT,
} from "./mothership-paths-v1.js";

export type QnapInvoicePathRootKindV1 = "tisly" | "public_tisly";

export type QnapInvoicePathCandidateV1 = {
  kind: QnapInvoicePathRootKindV1;
  /** WebDAV PUT 用（ベース URL 相対） */
  remoteRel: string;
  /** 画面表示・ログ用の絶対パス */
  absolutePath: string;
  label: string;
};

/** WebDAV ベース URL の pathname を正規化 */
export function normalizeWebDavBasePathname(webdavUrl: string): string {
  try {
    const p = new URL(webdavUrl).pathname.replace(/\/+$/, "") || "/";
    return p === "" ? "/" : p;
  } catch {
    return "/";
  }
}

/**
 * WebDAV ベースに応じたリモート相対パスを組み立てる。
 * - ベースが /TiSLY → Invoices_Estimates/...
 * - ベースが /Public → TiSLY/Invoices_Estimates/...
 * - ベースが / またはその他 → TiSLY/Invoices_Estimates/...
 */
export function resolveRemoteRelForWebDavBaseV1(
  webdavUrl: string,
  fileName: string,
  root: QnapInvoicePathRootKindV1,
  date = new Date()
): string {
  const basePath = normalizeWebDavBasePathname(webdavUrl).toLowerCase();
  const primaryRel = buildInvoicesEstimatesBackupRelativePathV1(fileName, date);
  const underTisly = `TiSLY/${primaryRel}`;
  const publicRel = buildInvoicesEstimatesPublicRelativePathV1(fileName, date);

  if (root === "public_tisly") {
    if (basePath.endsWith("/public/tisly") || basePath === "/public/tisly") {
      return primaryRel;
    }
    if (basePath.endsWith("/public") || basePath === "/public") {
      return underTisly;
    }
    // ルート / や /TiSLY のまま Public へ書く
    return publicRel;
  }

  // primary /TiSLY
  if (basePath.endsWith("/tisly") || basePath === "/tisly") {
    return primaryRel;
  }
  if (basePath.endsWith("/public") || basePath === "/public") {
    return underTisly;
  }
  return underTisly;
}

/** 1ファイル分のパス候補（primary → Public フォールバック） */
export function listInvoiceEstimatePathCandidatesV1(
  fileName: string,
  webdavUrl?: string | null,
  date = new Date()
): QnapInvoicePathCandidateV1[] {
  const url = String(webdavUrl || "").trim();
  return [
    {
      kind: "tisly",
      remoteRel: url
        ? resolveRemoteRelForWebDavBaseV1(url, fileName, "tisly", date)
        : buildInvoicesEstimatesBackupRelativePathV1(fileName, date),
      absolutePath: buildInvoicesEstimatesAbsolutePathV1(fileName, date, "tisly"),
      label: `/TiSLY/${INVOICES_ESTIMATES_BACKUP_ROOT}/`,
    },
    {
      kind: "public_tisly",
      remoteRel: url
        ? resolveRemoteRelForWebDavBaseV1(url, fileName, "public_tisly", date)
        : buildInvoicesEstimatesPublicRelativePathV1(fileName, date),
      absolutePath: buildInvoicesEstimatesAbsolutePathV1(
        fileName,
        date,
        "public_tisly"
      ),
      label: `/Public/TiSLY/${INVOICES_ESTIMATES_BACKUP_ROOT}/`,
    },
  ];
}

/** 403/404/権限エラー系で Public フォールバックへ進むべきか */
export function shouldFallbackToPublicTislyV1(
  statusOrMessage: number | string | null | undefined
): boolean {
  if (typeof statusOrMessage === "number") {
    return (
      statusOrMessage === 403 ||
      statusOrMessage === 404 ||
      statusOrMessage === 401
    );
  }
  const msg = String(statusOrMessage || "");
  return /\bHTTP\s*403\b|\bHTTP\s*404\b|\bHTTP\s*401\b|\b403\b|\b404\b|\b401\b|Forbidden|Not Found|Unauthorized|permission|Access Denied|書き込み|権限|denied|Privilege|共有フォルダ/i.test(
    msg
  );
}

/**
 * /TiSLY ベースの WebDAV URL を /Public ベースへ書き換える
 * （同一ベースでは /Public/TiSLY に書けないため）
 */
export function rewriteWebDavBaseForPublicTislyV1(webdavUrl: string): string {
  try {
    const u = new URL(webdavUrl);
    const pathLower = (u.pathname || "/").replace(/\/+$/, "").toLowerCase();
    if (pathLower.endsWith("/public/tisly") || pathLower === "/public/tisly") {
      return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
    }
    if (pathLower.endsWith("/public") || pathLower === "/public") {
      return `${u.protocol}//${u.host}/Public`;
    }
    // /TiSLY や / → /Public
    return `${u.protocol}//${u.host}/Public`;
  } catch {
    return String(webdavUrl || "").replace(/\/TiSLY\/?$/i, "/Public") || webdavUrl;
  }
}
