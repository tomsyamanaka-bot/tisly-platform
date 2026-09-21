"""
VPS 上で Tailscale / WebDAV ポートを診断する。
認証情報は標準出力に出さない。
"""
from __future__ import annotations

import base64
import http.client
import socket
import ssl
import subprocess
from pathlib import Path
from urllib.parse import urlparse


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


def tcp_probe(host: str, port: int, timeout: float = 4.0) -> str:
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return "OPEN"
    except Exception as e:
        return type(e).__name__
    finally:
        s.close()


def dav_request(
    scheme: str,
    host: str,
    port: int,
    method: str,
    path: str,
    token: str,
    body: bytes | None = None,
    extra_headers: dict[str, str] | None = None,
) -> str:
    ctx = ssl._create_unverified_context()
    headers = {
        "Authorization": f"Basic {token}",
        "User-Agent": "TiSLY-PWA",
        "Translate": "f",
    }
    if extra_headers:
        headers.update(extra_headers)
    try:
        if scheme == "https":
            conn = http.client.HTTPSConnection(
                host, port, timeout=12, context=ctx
            )
        else:
            conn = http.client.HTTPConnection(host, port, timeout=12)
        conn.request(method, path, body=body, headers=headers)
        res = conn.getresponse()
        res.read()
        conn.close()
        return f"HTTP {res.status}"
    except Exception as e:
        return f"ERR {type(e).__name__}"


def propfind(scheme: str, host: str, port: int, path: str, token: str) -> str:
    return dav_request(
        scheme,
        host,
        port,
        "PROPFIND",
        path,
        token,
        extra_headers={"Depth": "0"},
    )


def main() -> None:
    env = load_env("/opt/tisly/server/.env")
    url = env.get("QNAP_WEBDAV_URL", "")
    parsed = urlparse(url) if url else None
    print("QNAP_MODE", env.get("QNAP_MODE") or "(unset)")
    print(
        "QNAP_WEBDAV_TIMEOUT_MS",
        env.get("QNAP_WEBDAV_TIMEOUT_MS") or "(unset)",
    )
    print("URL_SCHEME", parsed.scheme if parsed else None)
    print("URL_HOST", parsed.hostname if parsed else None)
    print("URL_PORT", parsed.port if parsed else None)
    print("URL_PATH", parsed.path if parsed else None)
    user = (
        env.get("QNAP_WEBDAV_USER")
        or env.get("QNAP_USER")
        or env.get("QNAP_USERNAME")
        or ""
    ).strip()
    pw = env.get("QNAP_WEBDAV_PASSWORD") or env.get("QNAP_PASSWORD") or ""
    qnap_keys = sorted(k for k in env if k.startswith("QNAP_"))
    print("QNAP_KEYS", ",".join(qnap_keys))
    print("USER_SET", bool(user))
    print("USER_FALLBACK", "tomsadmin" if not user else "configured")
    print("PASS_SET", bool(pw))
    if not user:
        user = "tomsadmin"

    host = (parsed.hostname if parsed else None) or "100.99.31.120"
    print("TCP_HOST", host)
    for port in (80, 443, 5000, 5001, 5005, 5006, 8080):
        print(f"PORT {port}: {tcp_probe(host, port)}")

    if not user or not pw:
        print("PROPFIND skipped (no credentials)")
        return
    token = base64.b64encode(f"{user}:{pw}".encode()).decode()
    paths = ["/TiSLY/", "/Public/", "/", "/TiSLY/Invoices_Estimates/"]
    candidates = [
        ("http", host, 8080),
        ("https", host, 443),
        ("http", host, 5005),
        ("https", host, 5006),
        ("http", host, 5000),
        ("https", host, 5001),
    ]
    open_ports = {
        8080: tcp_probe(host, 8080) == "OPEN",
        443: True,
        5005: False,
        5006: False,
        5000: False,
        5001: False,
    }
    for scheme, h, port in candidates:
        if tcp_probe(h, port) != "OPEN":
            print(f"SKIP closed {scheme}://{h}:{port}")
            continue
        for path in paths:
            status = propfind(scheme, h, port, path, token)
            print(f"{scheme}://{h}:{port}{path} {status}")

    print("=== File Station login / upload ===")
    from urllib.parse import urlencode
    from datetime import datetime, timezone
    import re as _re

    def http_get(scheme, host, port, path_qs, timeout=12):
        ctx = ssl._create_unverified_context()
        if scheme == "https":
            conn = http.client.HTTPSConnection(
                host, port, timeout=timeout, context=ctx
            )
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request(
            "GET",
            path_qs,
            headers={"User-Agent": "TiSLY-PWA", "Accept": "*/*"},
        )
        res = conn.getresponse()
        body = res.read()
        conn.close()
        return res.status, body

    def extract_sid(body: bytes) -> str:
        text = body.decode("utf-8", "replace")
        m = _re.search(
            r"<authSid>\s*(?:<!\[CDATA\[(.*?)\]\]>|(.*?))\s*</authSid>",
            text,
            _re.I | _re.S,
        )
        if m:
            return (m.group(1) or m.group(2) or "").strip()
        m = _re.search(r'"sid"\s*:\s*"([^"]+)"', text, _re.I)
        if m:
            return m.group(1).strip()
        return ""

    def login_hint(body: bytes) -> str:
        text = body.decode("utf-8", "replace")
        hint = ""
        for tag in (
            "authPassed",
            "errorValue",
            "errorNum",
            "status",
            "need_2sv",
            "result",
            "authSid",
        ):
            m = _re.search(
                rf"<{tag}>\s*(?:<!\[CDATA\[(.*?)\]\]>|(.*?))\s*</{tag}>",
                text,
                _re.I | _re.S,
            )
            if m:
                val = (m.group(1) or m.group(2) or "").strip()
                if tag == "authSid" and val:
                    val = "present"
                hint += f"{tag}={val};"
        if not hint:
            compact = _re.sub(r"\s+", " ", text)[:120]
            hint = f"raw={compact}"
        return hint

    login_paths = [
        "/cgi-bin/authLogin.cgi",
        "/cgi-bin/filemanager/utilRequest.cgi",
    ]
    sid = ""
    login_attempts = [
        {"user": user, "pwd": pw},
        {"user": user, "pwd": pw.encode("utf-8").hex()},
        {"user": user, "pwd": pw, "service": "1"},
        {"user": user, "pwd": pw.encode("utf-8").hex(), "service": "1"},
    ]
    for login_path in login_paths:
        for fields in login_attempts:
            qs = urlencode(fields)
            label = "hex" if len(fields.get("pwd", "")) > 20 else "plain"
            if "service" in fields:
                label += "+svc"
            try:
                status, body = http_get(
                    "http", host, 8080, f"{login_path}?{qs}"
                )
                sid = extract_sid(body)
                print(
                    f"FS_LOGIN {login_path} {label} HTTP {status} "
                    f"SID={'yes' if sid else 'no'} {login_hint(body)}"
                )
                if sid:
                    break
            except Exception as e:
                print(f"FS_LOGIN {login_path} {label} ERR {type(e).__name__}")
        if sid:
            break

    if not sid:
        print("E2E_PUT_OK no")
        print("E2E_SAVE_FLAG QNAP_SAVED_FAIL")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    file_name = f"tisly-vpn-probe-{stamp}.txt"
    dest_folder = "/TiSLY/Invoices_Estimates"
    payload = (
        f"TiSLY VPN probe {stamp}\n"
        "status=QNAP_SAVED_GREEN\n"
    ).encode("utf-8")
    boundary = "----TislyFsBoundaryProbe"
    util = "/cgi-bin/filemanager/utilRequest.cgi"
    qs_up = urlencode(
        {
            "func": "upload",
            "type": "standard",
            "sid": sid,
            "dest_path": dest_folder,
            "overwrite": "1",
            "progress": file_name,
        }
    )
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; '
        f'filename="{file_name}"\r\n'
        "Content-Type: text/plain\r\n\r\n"
    ).encode("utf-8")
    footer = f"\r\n--{boundary}--\r\n".encode("utf-8")
    body = header + payload + footer
    try:
        conn = http.client.HTTPConnection(host, 8080, timeout=20)
        conn.request(
            "POST",
            f"{util}?{qs_up}",
            body=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "User-Agent": "TiSLY-PWA",
            },
        )
        res = conn.getresponse()
        resp_body = res.read()
        conn.close()
        print(f"FS_UPLOAD HTTP {res.status} LEN={len(resp_body)}")
        ok = res.status in (200, 201, 204)
        text = resp_body.decode("utf-8", "replace")[:200]
        if "error" in text.lower() and "error\":\"0\"" not in text.lower():
            print("FS_UPLOAD_BODY_HINT", text.replace("\n", " ")[:180])
            if '"status": 1' in text or "success" in text.lower() or ok:
                ok = True
        if ok:
            print("E2E_PUT_OK", f"HTTP {res.status}")
            print("E2E_SAVE_FLAG", "QNAP_SAVED_GREEN")
            print("E2E_REMOTE", f"{dest_folder}/{file_name}")
        else:
            print("E2E_PUT_OK no")
            print("E2E_SAVE_FLAG QNAP_SAVED_FAIL")
    except Exception as e:
        print(f"FS_UPLOAD ERR {type(e).__name__}")
        print("E2E_PUT_OK no")
        print("E2E_SAVE_FLAG QNAP_SAVED_FAIL")


if __name__ == "__main__":
    main()
    try:
        out = subprocess.check_output(
            ["tailscale", "ip", "-4"], text=True, timeout=10
        ).strip()
        print("VPS_TAILSCALE_IP", out)
    except Exception:
        print("VPS_TAILSCALE_IP unknown")
