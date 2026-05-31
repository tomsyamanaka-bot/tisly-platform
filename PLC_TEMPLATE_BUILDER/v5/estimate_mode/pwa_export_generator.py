#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.18 — PWA Export Strengthening
manifest.json / service-worker.js / offline.html / icons を強化し
スマホ PWA ホーム画面追加可能な構成にする。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ui_dashboard_generator import UiDashboardContext, build_ui_context

VERSION = "v5.18"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — PWA Export Strengthening"

PWA_EXTRA_FILES = (
    "manifest.json",
    "offline.html",
    "icons/icon-192.svg",
    "icons/icon-512.svg",
)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "tisly"


def generate_manifest_json(ctx: UiDashboardContext) -> str:
    slug = _slug(ctx.project_name or f"device-{ctx.device_id}")
    payload = {
        "name": f"TiSLY — {ctx.project_name}",
        "short_name": "TiSLY",
        "description": f"TiSLY Security Dashboard — {ctx.project_name}",
        "start_url": "./index.html",
        "scope": "./",
        "display": "standalone",
        "display_override": ["standalone", "minimal-ui"],
        "background_color": "#0a1628",
        "theme_color": "#0a1628",
        "orientation": "any",
        "lang": "ja",
        "id": f"tisly-pwa-{slug}",
        "categories": ["utilities", "productivity"],
        "icons": [
            {"src": "./icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml", "purpose": "any"},
            {"src": "./icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any maskable"},
        ],
        "shortcuts": [
            {"name": "Dashboard", "url": "./index.html", "description": "メインダッシュボード"},
            {"name": "TV Mode", "url": "./tv.html", "description": "Google TV ランチャー"},
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def generate_enhanced_service_worker() -> str:
    return f"""// {BUILDER_LABEL}
const CACHE = "tisly-pwa-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./manifest.webmanifest",
  "./UI_CONFIG.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
}});

self.addEventListener("activate", (e) => {{
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
}});

self.addEventListener("fetch", (e) => {{
  if (e.request.mode === "navigate") {{
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match("./index.html").then((r) => r || caches.match("./offline.html"))
      )
    );
    return;
  }}
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match("./offline.html")))
  );
}});
"""


def generate_offline_html(ctx: UiDashboardContext) -> str:
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a1628">
  <title>TiSLY — オフライン</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    body {{ display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; }}
    .offline-msg {{ padding:2rem; }}
    .offline-msg h1 {{ color:#00c8b4; margin-bottom:1rem; }}
  </style>
</head>
<body class="tisly-ui">
  <div class="offline-msg">
    <h1>TiSLY — オフライン</h1>
    <p>{ctx.project_name}</p>
    <p>ネットワークに接続できません。キャッシュされた画面を表示しています。</p>
    <p><a href="./index.html">ダッシュボードへ戻る</a></p>
  </div>
</body>
</html>
"""


def generate_icon_svg(size: int) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" fill="#0a1628" rx="{size // 8}"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
        font-family="Segoe UI,sans-serif" font-size="{size // 3}" font-weight="700" fill="#00c8b4">TiSLY</text>
</svg>
"""


def write_pwa_export_files(project_dir: Path) -> dict[str, Path]:
    """TISLY/UI/ 配下に PWA 強化ファイルを書き出す。"""
    tisly_dir = project_dir / "TISLY"
    config_path = tisly_dir / "NODE_RED_CONFIG.json"
    if not config_path.is_file():
        raise FileNotFoundError(f"NODE_RED_CONFIG.json が見つかりません: {config_path}")

    ctx = build_ui_context(
        config_path,
        tisly_dir / "DEVICE_MAP.csv",
        tisly_dir / "MQTT_TOPICS.md",
    )
    ui_dir = tisly_dir / "UI"
    icons_dir = ui_dir / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    # Enhanced service worker overwrites sw.js
    sw_content = generate_enhanced_service_worker()
    (ui_dir / "sw.js").write_text(sw_content, encoding="utf-8")

    writers = {
        "manifest.json": generate_manifest_json(ctx),
        "offline.html": generate_offline_html(ctx),
        "icons/icon-192.svg": generate_icon_svg(192),
        "icons/icon-512.svg": generate_icon_svg(512),
    }
    paths: dict[str, Path] = {"sw.js": ui_dir / "sw.js"}
    for name, content in writers.items():
        path = ui_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


def pwa_manifest_json_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return data.get("display") == "standalone" and "icons" in data and len(data["icons"]) >= 2


def pwa_offline_html_valid(text: str) -> bool:
    return "オフライン" in text and "index.html" in text


def pwa_sw_offline_fallback(text: str) -> bool:
    return "offline.html" in text and "skipWaiting" in text


def pwa_icons_exist(ui_dir: Path) -> bool:
    return (ui_dir / "icons" / "icon-192.svg").is_file() and (ui_dir / "icons" / "icon-512.svg").is_file()


def audit_pwa_export(project_dir: Path) -> list[tuple[str, bool, str]]:
    ui_dir = project_dir / "TISLY" / "UI"
    manifest_path = ui_dir / "manifest.json"
    offline_path = ui_dir / "offline.html"
    sw_path = ui_dir / "sw.js"

    manifest_text = manifest_path.read_text(encoding="utf-8") if manifest_path.is_file() else ""
    offline_text = offline_path.read_text(encoding="utf-8") if offline_path.is_file() else ""
    sw_text = sw_path.read_text(encoding="utf-8") if sw_path.is_file() else ""

    return [
        ("manifest.json PWA", pwa_manifest_json_valid(manifest_text), "OK" if pwa_manifest_json_valid(manifest_text) else "NG"),
        ("offline.html", pwa_offline_html_valid(offline_text), "OK" if pwa_offline_html_valid(offline_text) else "NG"),
        ("sw.js オフライン対応", pwa_sw_offline_fallback(sw_text), "OK" if pwa_sw_offline_fallback(sw_text) else "NG"),
        ("icons プレースホルダ", pwa_icons_exist(ui_dir), "192+512" if pwa_icons_exist(ui_dir) else "不足"),
    ]
