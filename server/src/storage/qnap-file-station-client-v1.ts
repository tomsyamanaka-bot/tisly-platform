/**
 * QNAP File Station API クライアント v1
 * WebDAV 不通時の代替アップロード（utilRequest.cgi）
 */
import fs from "fs";
import path from "path";
import {
  DEFAULT_WEBDAV_TIMEOUT_MS,
  formatFetchError,
  qnapWebDavFetch,
} from "../business/services/qnap-webdav-fetch-v1.js";

const DEFAULT_TIMEOUT_HINT_MS = DEFAULT_WEBDAV_TIMEOUT_MS;

export type FileStationUploadResultV1 = {
  ok: boolean;
  host: string;
  port: number;
  sid?: string;
  error?: string;
  destPath?: string;
};

function unwrapXmlCdataV1(raw: string): string {
  const t = String(raw || "").trim();
  const m = t.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return m ? String(m[1] || "").trim() : t;
}

function extractXmlTagV1(body: string, tag: string): string {
  const xml = String(body || "").match(
    new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i")
  );
  if (!xml?.[1]) return "";
  return unwrapXmlCdataV1(xml[1]);
}

/** QNAP XML の SID を取り出す。
 * CDATA 付き応答にも対応する。
 */
export function extractQnapAuthSidV1(body: string): string | null {
  const sid = extractXmlTagV1(body, "authSid");
  if (sid) return sid;
  const jsonSid = String(body || "").match(/"sid"\s*:\s*"([^"]+)"/i);
  if (jsonSid?.[1]) return jsonSid[1].trim();
  const plain = String(body || "").match(/authSid[=:]\s*([A-Za-z0-9_-]+)/i);
  if (plain?.[1]) return plain[1].trim();
  return null;
}

export type QnapAuthLoginHintV1 = {
  authPassed: string;
  errorValue: string;
  need2sv: string;
  sid: string | null;
};

/** File Station ログイン XML の要点。
 * パスワード誤りは errorValue=-1 が多い。
 */
export function parseQnapAuthLoginHintV1(body: string): QnapAuthLoginHintV1 {
  return {
    authPassed: extractXmlTagV1(body, "authPassed"),
    errorValue: extractXmlTagV1(body, "errorValue"),
    need2sv:
      extractXmlTagV1(body, "need_2sv") || extractXmlTagV1(body, "need2SV"),
    sid: extractQnapAuthSidV1(body),
  };
}

function extractAuthSid(body: string): string | null {
  return extractQnapAuthSidV1(body);
}

function encodeQnapPwdHex(password: string): string {
  return Buffer.from(String(password || ""), "utf8").toString("hex");
}

function buildMultipart(
  fieldName: string,
  fileName: string,
  fileBuf: Buffer
): { body: Buffer; contentType: string } {
  const boundary = `----TislyFsBoundary${Date.now().toString(36)}`;
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(header, "utf8"),
    fileBuf,
    Buffer.from(footer, "utf8"),
  ]);
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** File Station ベース（utilRequest.cgi のオリジン）を解決 */
export function resolveFileStationBaseUrl(explicit?: string | null): string {
  const raw = String(explicit || "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* */
    }
  }
  const host =
    String(process.env.QNAP_TAILSCALE_HOST || process.env.QNAP_HOST || "100.99.31.120").trim() ||
    "100.99.31.120";
  return `http://${host}:8080`;
}

/** Platform Settings 疎通テスト用 — File Station ログインのみ */
export async function probeFileStationAuthV1(options: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  return loginFileStation(options.baseUrl, options.username, options.password);
}

async function loginFileStation(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const user = String(username || "").trim();
  const pass = String(password || "");
  if (!user || !pass) {
    return { ok: false, error: "File Station 認証情報が不足しています" };
  }

  const attempts: Array<{ user: string; pwd: string; label: string }> = [
    { user, pwd: pass, label: "plain" },
    { user, pwd: encodeQnapPwdHex(pass), label: "hex" },
  ];

  const loginUrls = [
    `${baseUrl.replace(/\/+$/, "")}/cgi-bin/authLogin.cgi`,
    `${baseUrl.replace(/\/+$/, "")}/cgi-bin/filemanager/utilRequest.cgi`,
  ];

  let lastError = "File Station login failed";
  for (const loginUrl of loginUrls) {
    for (const attempt of attempts) {
      try {
        const qs = new URLSearchParams({
          user: attempt.user,
          pwd: attempt.pwd,
        });
        const res = await qnapWebDavFetch(`${loginUrl}?${qs.toString()}`, {
          method: "GET",
          headers: { Accept: "*/*" },
        });
        const text = await res.text();
        const hint = parseQnapAuthLoginHintV1(text);
        if (hint.sid) {
          return { ok: true, sid: hint.sid };
        }
        if (hint.authPassed === "0") {
          lastError =
            `File Station 認証失敗 ` +
            `(${attempt.label} errorValue=${hint.errorValue || "?"})`;
        }
        // utilRequest login 形式
        if (/utilRequest\.cgi/i.test(loginUrl)) {
          const qs2 = new URLSearchParams({
            func: "get_tree",
            node: "share_root",
            user: attempt.user,
            pwd: attempt.pwd,
          });
          const res2 = await qnapWebDavFetch(`${loginUrl}?${qs2.toString()}`, {
            method: "GET",
          });
          const text2 = await res2.text();
          const sid2 = extractAuthSid(text2);
          if (sid2) return { ok: true, sid: sid2 };
          lastError = `login(${attempt.label}) HTTP ${res2.status}`;
        } else if (hint.authPassed !== "0") {
          lastError = `authLogin(${attempt.label}) HTTP ${res.status}`;
        }
      } catch (e) {
        lastError = formatFetchError(e);
      }
    }
  }
  return { ok: false, error: lastError };
}

function listDestPathCandidates(remoteRel: string, shareName: string): string[] {
  const rel = String(remoteRel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const dir = path.posix.dirname(rel);
  const share = String(shareName || "TiSLY").replace(/^\/+|\/+$/g, "") || "TiSLY";
  const candidates = [
    `/${share}/${dir}`,
    `/${dir}`,
    `/Public/${dir}`,
    `/${share}`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const n = c.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

async function ensureRemoteDir(
  utilUrl: string,
  sid: string,
  destPath: string
): Promise<void> {
  const parts = destPath.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const parent = "/" + parts.slice(0, i).join("/");
    const name = parts[i];
    const qs = new URLSearchParams({
      func: "createdir",
      sid,
      dest_folder_path: parent === "/" ? `/${parts[0] || "TiSLY"}` : parent,
      dest_folder_name: name,
    });
    // 親が / のときは share 直下作成
    if (i === 0) {
      qs.set("dest_folder_path", "/");
      qs.set("dest_folder_name", name);
    }
    try {
      await qnapWebDavFetch(`${utilUrl}?${qs.toString()}`, { method: "GET" });
    } catch {
      /* 既存ディレクトリ等は無視 */
    }
  }
}

/**
 * File Station Direct Upload
 * @param utilRequestUrl 例: http://100.99.31.120:8080/cgi-bin/filemanager/utilRequest.cgi
 */
export async function uploadViaFileStationV1(options: {
  utilRequestUrl: string;
  username: string;
  password: string;
  localAbs: string;
  remoteRel: string;
  shareName?: string;
}): Promise<FileStationUploadResultV1> {
  const baseUrl = resolveFileStationBaseUrl(options.utilRequestUrl);
  let host = "100.99.31.120";
  let port = 8080;
  try {
    const u = new URL(baseUrl);
    host = u.hostname;
    port = Number(u.port) || 8080;
  } catch {
    /* */
  }

  if (!fs.existsSync(options.localAbs)) {
    return {
      ok: false,
      host,
      port,
      error: `ローカル PDF が見つかりません: ${options.localAbs}`,
    };
  }

  const login = await loginFileStation(
    baseUrl,
    options.username,
    options.password
  );
  if (!login.ok || !login.sid) {
    return {
      ok: false,
      host,
      port,
      error: login.error || "File Station ログイン失敗",
    };
  }

  const utilUrl = `${baseUrl.replace(/\/+$/, "")}/cgi-bin/filemanager/utilRequest.cgi`;
  const fileName = path.basename(options.localAbs);
  const fileBuf = fs.readFileSync(options.localAbs);
  const destCandidates = listDestPathCandidates(
    options.remoteRel,
    options.shareName || "TiSLY"
  );

  let lastError = "File Station upload failed";
  for (const destPath of destCandidates) {
    try {
      await ensureRemoteDir(utilUrl, login.sid, destPath);
      const multipart = buildMultipart("file", fileName, fileBuf);
      const progress = `efile-${Date.now()}`;
      const qs = new URLSearchParams({
        func: "upload",
        type: "standard",
        sid: login.sid,
        dest_path: destPath,
        overwrite: "1",
        progress,
      });
      const res = await qnapWebDavFetch(`${utilUrl}?${qs.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": multipart.contentType,
          Accept: "*/*",
        },
        body: multipart.body as unknown as BodyInit,
      });
      const text = await res.text().catch(() => "");
      const okStatus = res.status >= 200 && res.status < 300;
      const okBody =
        /success|"status":\s*1|true/i.test(text) ||
        text.trim() === "" ||
        /OK/i.test(text);
      if (okStatus && (okBody || res.status === 200 || res.status === 201)) {
        console.log(
          `[QNAP FileStation] uploaded ${fileName} → ${destPath} (${host}:${port})`
        );
        return {
          ok: true,
          host,
          port,
          sid: login.sid,
          destPath,
        };
      }
      lastError = `upload HTTP ${res.status}: ${text.slice(0, 180)}`;
    } catch (e) {
      lastError = formatFetchError(e);
      if (/timeout/i.test(lastError)) {
        lastError = `File Station timeout after ~${DEFAULT_TIMEOUT_HINT_MS}ms`;
      }
    }
  }

  return { ok: false, host, port, error: lastError, sid: login.sid };
}
