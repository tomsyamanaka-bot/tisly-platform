"""QNAP 見積書保存 E2E 検証 v1

WebDAV（5005/5006）と File Station（:8080）の
両経路を順に試し、テスト見積書を
/TiSLY/Invoices_Estimates へ PUT する。

秘密情報は出力しない（set/unset のみ表示）。
LAN 直結・Tailscale どちらからでも実行できる。

使い方:
    python scripts/qnap-e2e-estimate-save-v1.py
    python scripts/qnap-e2e-estimate-save-v1.py --env /opt/tisly/server/.env
"""

from __future__ import annotations

import argparse
import base64
import http.client
import re
import socket
import ssl
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse, quote

# VPN 再接続・暗号化の揺らぎを吸収する
# 既定タイムアウト（アプリ側と同値）
PROBE_TIMEOUT_SEC = 12
UPLOAD_TIMEOUT_SEC = 15

DEST_FOLDER = "/TiSLY/Invoices_Estimates"


def load_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text(errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def tcp_open(host: str, port: int, timeout: float = 4.0) -> bool:
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return True
    except Exception:
        return False
    finally:
        s.close()


def _conn(scheme: str, host: str, port: int, timeout: int):
    if scheme == "https":
        return http.client.HTTPSConnection(
            host,
            port,
            timeout=timeout,
            context=ssl._create_unverified_context(),
        )
    return http.client.HTTPConnection(host, port, timeout=timeout)


def dav_request(
    scheme: str,
    host: str,
    port: int,
    method: str,
    path: str,
    token: str,
    body: bytes | None = None,
    extra: dict[str, str] | None = None,
    timeout: int = PROBE_TIMEOUT_SEC,
) -> int:
    headers = {
        "Authorization": "Basic {}".format(token),
        "User-Agent": "TiSLY-PWA",
        "Translate": "f",
    }
    if extra:
        headers.update(extra)
    try:
        conn = _conn(scheme, host, port, timeout)
        conn.request(method, path, body=body, headers=headers)
        res = conn.getresponse()
        res.read()
        conn.close()
        return res.status
    except Exception:
        return 0


def try_webdav_put(
    scheme: str,
    host: str,
    port: int,
    base_path: str,
    token: str,
    file_name: str,
    payload: bytes,
) -> tuple[bool, str]:
    """WebDAV で MKCOL → PUT を試す。"""
    if not tcp_open(host, port):
        return False, "port closed"
    root = base_path.rstrip("/") or ""
    folder = "{}/Invoices_Estimates".format(root)
    dav_request(scheme, host, port, "MKCOL", folder + "/", token)
    target = "{}/{}".format(folder, quote(file_name))
    status = dav_request(
        scheme,
        host,
        port,
        "PUT",
        target,
        token,
        body=payload,
        timeout=UPLOAD_TIMEOUT_SEC,
    )
    ok = status in (200, 201, 204)
    return ok, "HTTP {}".format(status)


def extract_sid(body: bytes) -> str:
    text = body.decode("utf-8", "replace")
    m = re.search(
        r"<authSid>\s*(?:<!\[CDATA\[(.*?)\]\]>|(.*?))\s*</authSid>",
        text,
        re.I | re.S,
    )
    if m:
        return (m.group(1) or m.group(2) or "").strip()
    m = re.search(r'"sid"\s*:\s*"([^"]+)"', text, re.I)
    return m.group(1).strip() if m else ""


def login_hint(body: bytes) -> str:
    text = body.decode("utf-8", "replace")
    hint = ""
    for tag in ("authPassed", "errorValue", "need_2sv", "status"):
        m = re.search(
            r"<{0}>\s*(?:<!\[CDATA\[(.*?)\]\]>|(.*?))\s*</{0}>".format(tag),
            text,
            re.I | re.S,
        )
        if m:
            hint += "{}={};".format(tag, (m.group(1) or m.group(2) or "").strip())
    if not hint:
        hint = "raw=" + re.sub(r"\s+", " ", text)[:90]
    return hint


def file_station_login(host: str, user: str, pw: str) -> tuple[str, str]:
    """File Station へログインし SID を得る。"""
    attempts = [
        ("plain", {"user": user, "pwd": pw}),
        ("hex", {"user": user, "pwd": pw.encode("utf-8").hex()}),
        (
            "plain+svc",
            {"user": user, "pwd": pw, "service": "1"},
        ),
    ]
    last = ""
    for label, fields in attempts:
        try:
            conn = _conn("http", host, 8080, PROBE_TIMEOUT_SEC)
            conn.request(
                "GET",
                "/cgi-bin/authLogin.cgi?" + urlencode(fields),
                headers={"User-Agent": "TiSLY-PWA"},
            )
            res = conn.getresponse()
            body = res.read()
            conn.close()
            sid = extract_sid(body)
            last = "{} HTTP {} {}".format(label, res.status, login_hint(body))
            print("  FS_LOGIN", last, "SID=" + ("yes" if sid else "no"))
            if sid:
                return sid, last
        except Exception as exc:
            last = "{} ERR {}".format(label, type(exc).__name__)
            print("  FS_LOGIN", last)
    return "", last


def file_station_upload(
    host: str, sid: str, file_name: str, payload: bytes
) -> tuple[bool, str]:
    boundary = "----TislyE2EBoundary"
    qs = urlencode(
        {
            "func": "upload",
            "type": "standard",
            "sid": sid,
            "dest_path": DEST_FOLDER,
            "overwrite": "1",
            "progress": file_name,
        }
    )
    head = (
        "--{}\r\n".format(boundary)
        + 'Content-Disposition: form-data; name="file"; '
        + 'filename="{}"\r\n'.format(file_name)
        + "Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8")
    tail = "\r\n--{}--\r\n".format(boundary).encode("utf-8")
    try:
        conn = _conn("http", host, 8080, UPLOAD_TIMEOUT_SEC)
        conn.request(
            "POST",
            "/cgi-bin/filemanager/utilRequest.cgi?" + qs,
            body=head + payload + tail,
            headers={
                "Content-Type": "multipart/form-data; boundary={}".format(
                    boundary
                ),
                "User-Agent": "TiSLY-PWA",
            },
        )
        res = conn.getresponse()
        body = res.read()
        conn.close()
        ok = res.status in (200, 201, 204)
        return ok, "HTTP {} len={}".format(res.status, len(body))
    except Exception as exc:
        return False, "ERR {}".format(type(exc).__name__)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default="server/.env")
    args = ap.parse_args()

    env = load_env(args.env)
    if not env:
        env = load_env("/opt/tisly/server/.env")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    file_name = "tisly-e2e-estimate-{}.pdf".format(stamp)
    payload = (
        "%PDF-1.4\n% TiSLY E2E estimate probe {}\n"
        "status=QNAP_SAVED_GREEN\n%%EOF\n".format(stamp)
    ).encode("utf-8")

    webdav_url = env.get("QNAP_WEBDAV_URL", "")
    parsed = urlparse(webdav_url) if webdav_url else None
    tailscale_host = (
        env.get("QNAP_TAILSCALE_HOST")
        or (parsed.hostname if parsed else None)
        or env.get("QNAP_HOST")
        or "100.99.31.120"
    )
    lan_host = env.get("QNAP_LOCAL_HOST") or "192.168.1.10"
    base_path = (parsed.path if parsed else "/TiSLY") or "/TiSLY"

    user = (
        env.get("QNAP_WEBDAV_USER")
        or env.get("QNAP_USERNAME")
        or env.get("QNAP_USER")
        or ""
    ).strip()
    pw = env.get("QNAP_WEBDAV_PASSWORD") or env.get("QNAP_PASSWORD") or ""
    print("ENV_FILE", args.env)
    print("TAILSCALE_HOST", tailscale_host)
    print("LAN_HOST", lan_host)
    print("BASE_PATH", base_path)
    print("USER_SET", bool(user), "PASS_SET", bool(pw))
    if not user or not pw:
        print("E2E_SAVE_FLAG QNAP_SAVED_FAIL (no credentials)")
        return 2

    token = base64.b64encode("{}:{}".format(user, pw).encode()).decode()

    routes = [
        ("webdav-ts-5005", "http", tailscale_host, 5005),
        ("webdav-ts-5006", "https", tailscale_host, 5006),
        ("webdav-lan-5005", "http", lan_host, 5005),
        ("webdav-lan-5006", "https", lan_host, 5006),
        ("webdav-lan-8080", "http", lan_host, 8080),
    ]
    for label, scheme, host, port in routes:
        ok, detail = try_webdav_put(
            scheme, host, port, base_path, token, file_name, payload
        )
        print("ROUTE {}: {} {}".format(label, "OK" if ok else "NG", detail))
        if ok:
            print("E2E_PUT_OK", detail)
            print("E2E_ROUTE", label)
            print("E2E_REMOTE", "{}/Invoices_Estimates/{}".format(
                base_path.rstrip("/"), file_name
            ))
            print("E2E_SAVE_FLAG QNAP_SAVED_GREEN")
            return 0

    for label, host in (
        ("filestation-ts", tailscale_host),
        ("filestation-lan", lan_host),
    ):
        if not tcp_open(host, 8080):
            print("ROUTE {}: NG port closed".format(label))
            continue
        print("ROUTE {}: login...".format(label))
        sid, hint = file_station_login(host, user, pw)
        if not sid:
            print("ROUTE {}: NG login failed ({})".format(label, hint))
            continue
        ok, detail = file_station_upload(host, sid, file_name, payload)
        print("ROUTE {}: {} {}".format(label, "OK" if ok else "NG", detail))
        if ok:
            print("E2E_PUT_OK", detail)
            print("E2E_ROUTE", label)
            print("E2E_REMOTE", "{}/{}".format(DEST_FOLDER, file_name))
            print("E2E_SAVE_FLAG QNAP_SAVED_GREEN")
            return 0

    print("E2E_PUT_OK no")
    print("E2E_SAVE_FLAG QNAP_SAVED_FAIL")
    print(
        "HUMAN_ACTION QTS で WebDAV を有効化（5005/5006）"
        "または QNAP_WEBDAV_USER/PASSWORD を実パスワードへ更新"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
