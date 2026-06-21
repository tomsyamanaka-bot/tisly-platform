/** Knowledge Field UX V2 — QNAP 深リンク（SMB / File Station / コピー用） */

import { MOTHERSHIP_HOST, MOTHERSHIP_UNC } from "../storage/mothership-paths-v1.js";

export interface QnapDeepLinksV1 {
  smbPath: string;
  webUrl: string;
  copyPath: string;
  relativePath: string;
}

function normalizeRelativePath(relativePath: string): string {
  return String(relativePath ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
}

/** QNAP 保存先の SMB / Web / コピー用パスを生成 */
export function buildQnapDeepLinksV1(relativePath: string): QnapDeepLinksV1 {
  const rel = normalizeRelativePath(relativePath);
  const smbSegments = rel ? rel.split("/").filter(Boolean) : [];
  const smbPath = smbSegments.length
    ? `${MOTHERSHIP_UNC}\\${smbSegments.join("\\")}`
    : MOTHERSHIP_UNC;
  const webUrl = rel
    ? `http://${MOTHERSHIP_HOST}/cgi-bin/filemanager/utilRequest.cgi?func=locate&path=/${rel}`
    : `http://${MOTHERSHIP_HOST}/cgi-bin/filemanager/`;

  return {
    smbPath,
    webUrl,
    copyPath: smbPath,
    relativePath: rel,
  };
}
