#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.16 — TiSLY UI Dashboard Template
NODE_RED_CONFIG.json / DEVICE_MAP.csv / MQTT_TOPICS.md から
PWA ダッシュボード（TISLY/UI/）を自動生成する。
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

VERSION = "v5.16"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — TiSLY UI Dashboard Template"

UI_FILES = (
    "UI_CONFIG.json",
    "index.html",
    "app.js",
    "styles.css",
    "manifest.webmanifest",
    "sw.js",
    "UI_README.md",
)


@dataclass
class UiDevice:
    name: str
    plc: str
    signal_type: str
    topic: str = ""


@dataclass
class UiDashboardContext:
    project_name: str
    device_id: str
    mqtt_broker: str
    mqtt_port: int
    ws_port: int
    base_topic: str
    state_topic: str
    alarm_topic: str
    motion_topic: str
    output_topic: str
    cmd_topic: str
    alarms: list[UiDevice] = field(default_factory=list)
    motions: list[UiDevice] = field(default_factory=list)
    contacts: list[UiDevice] = field(default_factory=list)
    outputs: list[UiDevice] = field(default_factory=list)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "tisly"


def build_ui_context(
    config_path: Path,
    device_map_path: Path | None = None,
    mqtt_topics_path: Path | None = None,
) -> UiDashboardContext:
    """TISLY/ 既存設定から UI 生成コンテキストを構築。"""
    config = json.loads(config_path.read_text(encoding="utf-8"))
    device_id = str(config.get("device_id", "100"))
    base = f"tisly/device/{device_id}"

    device_map: list[dict] = []
    if device_map_path and device_map_path.is_file():
        reader = csv.DictReader(io.StringIO(device_map_path.read_text(encoding="utf-8")))
        device_map = list(reader)

    plc_by_name = {row.get("TiSLY_Name", ""): row.get("PLC_Device", "") for row in device_map}

    def _devices(key: str, default_topic: str) -> list[UiDevice]:
        items: list[UiDevice] = []
        for entry in config.get(key, []):
            name = entry.get("name", "")
            signal = "ALARM" if key == "alarm_inputs" else (
                "MOTION" if key == "motion_inputs" else (
                    "CONTACT" if key == "contact_inputs" else "OUTPUT"
                )
            )
            items.append(
                UiDevice(
                    name=name,
                    plc=entry.get("plc") or plc_by_name.get(name, ""),
                    signal_type=signal,
                    topic=entry.get("topic", default_topic),
                )
            )
        return items

    state_topic = f"{base}/state"
    cmd_topic = f"{base}/cmd"
    if mqtt_topics_path and mqtt_topics_path.is_file():
        for line in mqtt_topics_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.endswith("/state") and line.startswith("tisly/"):
                state_topic = line
            elif line.endswith("/cmd") and line.startswith("tisly/"):
                cmd_topic = line

    return UiDashboardContext(
        project_name=config.get("project_name", ""),
        device_id=device_id,
        mqtt_broker=config.get("mqtt_broker", "mqtt.tisly.local"),
        mqtt_port=1883,
        ws_port=9001,
        base_topic=base,
        state_topic=state_topic,
        alarm_topic=f"{base}/alarm",
        motion_topic=f"{base}/motion",
        output_topic=f"{base}/output",
        cmd_topic=cmd_topic,
        alarms=_devices("alarm_inputs", f"{base}/alarm"),
        motions=_devices("motion_inputs", f"{base}/motion"),
        contacts=_devices("contact_inputs", state_topic),
        outputs=_devices("outputs", f"{base}/output"),
    )


def generate_ui_config_json(ctx: UiDashboardContext) -> str:
    payload = {
        "builder_version": BUILDER_LABEL,
        "project_name": ctx.project_name,
        "device_id": ctx.device_id,
        "mqtt": {
            "broker": ctx.mqtt_broker,
            "port": ctx.mqtt_port,
            "ws_port": ctx.ws_port,
            "client_id": f"tisly-ui-{ctx.device_id}",
        },
        "topics": {
            "base": ctx.base_topic,
            "state": ctx.state_topic,
            "alarm": ctx.alarm_topic,
            "motion": ctx.motion_topic,
            "output": ctx.output_topic,
            "cmd": ctx.cmd_topic,
        },
        "devices": {
            "alarms": [{"name": d.name, "plc": d.plc, "topic": d.topic} for d in ctx.alarms],
            "motions": [{"name": d.name, "plc": d.plc, "topic": d.topic} for d in ctx.motions],
            "contacts": [{"name": d.name, "plc": d.plc, "topic": d.topic} for d in ctx.contacts],
            "outputs": [{"name": d.name, "plc": d.plc, "topic": d.topic} for d in ctx.outputs],
        },
        "ui": {
            "theme": "tisly-dark",
            "layout": "responsive-grid",
            "google_tv_mode": True,
            "pwa": True,
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def _device_cards_html(devices: list[UiDevice], css_class: str) -> str:
    if not devices:
        return f'<p class="empty">— なし —</p>'
    cards = []
    for d in devices:
        cards.append(
            f'<div class="device-card {css_class}" data-device="{d.name}" data-plc="{d.plc}">'
            f'<span class="device-name">{d.name}</span>'
            f'<span class="device-plc">{d.plc}</span>'
            f'<span class="device-status" aria-live="polite">—</span>'
            f"</div>"
        )
    return "\n".join(cards)


def generate_index_html(ctx: UiDashboardContext) -> str:
    slug = _slug(ctx.project_name or f"device-{ctx.device_id}")
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0a1628">
  <meta name="description" content="TiSLY Dashboard — {ctx.project_name}">
  <title>TiSLY — {ctx.project_name}</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="styles.css">
</head>
<body class="tisly-ui" data-project="{slug}">
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark">TiSLY</span>
      <h1>{ctx.project_name}</h1>
    </div>
    <div class="header-meta">
      <span id="conn-status" class="conn-badge offline">MQTT 未接続</span>
      <span class="device-id">Device {ctx.device_id}</span>
    </div>
  </header>

  <main class="dashboard-grid">
    <section class="panel panel-state" aria-labelledby="state-heading">
      <h2 id="state-heading">システム状態</h2>
      <div id="system-state" class="state-summary">
        <div class="state-item"><span>Broker</span><code>{ctx.mqtt_broker}</code></div>
        <div class="state-item"><span>Topic</span><code>{ctx.base_topic}</code></div>
        <div class="state-item"><span>最終更新</span><time id="last-update">—</time></div>
      </div>
    </section>

    <section class="panel panel-alarms" aria-labelledby="alarms-heading">
      <h2 id="alarms-heading">警報 <span class="count">{len(ctx.alarms)}</span></h2>
      <div class="device-grid">
        {_device_cards_html(ctx.alarms, "signal-alarm")}
      </div>
    </section>

    <section class="panel panel-motion" aria-labelledby="motion-heading">
      <h2 id="motion-heading">動体検知 <span class="count">{len(ctx.motions)}</span></h2>
      <div class="device-grid">
        {_device_cards_html(ctx.motions, "signal-motion")}
      </div>
    </section>

    <section class="panel panel-contacts" aria-labelledby="contacts-heading">
      <h2 id="contacts-heading">接点 / スイッチ <span class="count">{len(ctx.contacts)}</span></h2>
      <div class="device-grid">
        {_device_cards_html(ctx.contacts, "signal-contact")}
      </div>
    </section>

    <section class="panel panel-outputs" aria-labelledby="outputs-heading">
      <h2 id="outputs-heading">出力 <span class="count">{len(ctx.outputs)}</span></h2>
      <div class="device-grid">
        {_device_cards_html(ctx.outputs, "signal-output")}
      </div>
    </section>
  </main>

  <footer class="app-footer">
    <span>{BUILDER_LABEL}</span>
    <span>TiSLY PRO Remote / Google TV 対応レイアウト</span>
  </footer>

  <script src="app.js" type="module"></script>
</body>
</html>
"""


def generate_app_js(ctx: UiDashboardContext) -> str:
    return f"""// {BUILDER_LABEL}
// PWA Dashboard — MQTT over WebSocket (browser)

const CONFIG = {{
  project: {json.dumps(ctx.project_name, ensure_ascii=False)},
  deviceId: {json.dumps(ctx.device_id)},
  mqtt: {{
    broker: {json.dumps(ctx.mqtt_broker)},
    wsPort: {ctx.ws_port},
    clientId: "tisly-ui-{ctx.device_id}-" + Math.random().toString(16).slice(2, 8),
  }},
  topics: {{
    state: {json.dumps(ctx.state_topic)},
    alarm: {json.dumps(ctx.alarm_topic)},
    motion: {json.dumps(ctx.motion_topic)},
    output: {json.dumps(ctx.output_topic)},
    cmd: {json.dumps(ctx.cmd_topic)},
  }},
}};

const connBadge = document.getElementById("conn-status");
const lastUpdate = document.getElementById("last-update");

function setConnection(online, label) {{
  connBadge.textContent = label;
  connBadge.classList.toggle("online", online);
  connBadge.classList.toggle("offline", !online);
}}

function updateDeviceCard(name, value, activeClass) {{
  document.querySelectorAll(".device-card").forEach((card) => {{
    if (card.dataset.device !== name) return;
    const status = card.querySelector(".device-status");
    const isActive = value === true || value === 1 || value === "1" || value === "ON";
    status.textContent = isActive ? "ACTIVE" : "—";
    card.classList.toggle(activeClass, isActive);
  }});
  lastUpdate.textContent = new Date().toLocaleString("ja-JP");
}}

function handlePayload(topic, payload) {{
  let data = payload;
  try {{
    data = JSON.parse(payload);
  }} catch (_) {{ /* raw string */ }}
  const name = typeof data === "object" && data ? (data.name || data.device || "") : "";
  const value = typeof data === "object" && data ? (data.value ?? data.state ?? data.active) : data;
  if (name) {{
    if (topic.includes("/alarm")) updateDeviceCard(name, value, "active-alarm");
    else if (topic.includes("/motion")) updateDeviceCard(name, value, "active-motion");
    else if (topic.includes("/output")) updateDeviceCard(name, value, "active-output");
    else updateDeviceCard(name, value, "active-contact");
  }}
}}

// Demo / offline mode — simulates MQTT until broker is configured
function initDemoMode() {{
  setConnection(false, "デモモード（MQTT未接続）");
  console.info("[TiSLY UI] Configure WebSocket broker in UI_CONFIG.json for live MQTT.");
}}

if ("serviceWorker" in navigator) {{
  navigator.serviceWorker.register("./sw.js").catch(console.warn);
}}

initDemoMode();
export {{ CONFIG }};
"""


def generate_styles_css(ctx: UiDashboardContext) -> str:
    return f"""/* {BUILDER_LABEL} */
:root {{
  --tisly-bg: #0a1628;
  --tisly-panel: #122038;
  --tisly-accent: #00c8b4;
  --tisly-alarm: #ff4757;
  --tisly-motion: #ffa502;
  --tisly-contact: #3742fa;
  --tisly-output: #2ed573;
  --tisly-text: #e8eef7;
  --tisly-muted: #8b9cb3;
  --grid-gap: clamp(0.75rem, 2vw, 1.5rem);
  --font-base: clamp(14px, 1.2vw, 20px);
  --font-title: clamp(1.25rem, 2.5vw, 2.5rem);
}}

* {{ box-sizing: border-box; margin: 0; padding: 0; }}

body.tisly-ui {{
  font-family: "Segoe UI", "Hiragino Sans", sans-serif;
  background: var(--tisly-bg);
  color: var(--tisly-text);
  font-size: var(--font-base);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}}

.app-header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--grid-gap) calc(var(--grid-gap) * 1.5);
  background: var(--tisly-panel);
  border-bottom: 2px solid var(--tisly-accent);
}}

.brand-mark {{
  color: var(--tisly-accent);
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-right: 0.75rem;
}}

.brand h1 {{ font-size: var(--font-title); display: inline; }}

.header-meta {{ display: flex; gap: 1rem; align-items: center; }}

.conn-badge {{
  padding: 0.35em 0.75em;
  border-radius: 999px;
  font-size: 0.85em;
  font-weight: 600;
}}
.conn-badge.offline {{ background: #3d3d3d; color: #ccc; }}
.conn-badge.online {{ background: var(--tisly-output); color: #0a1628; }}

.dashboard-grid {{
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: var(--grid-gap);
  padding: var(--grid-gap);
  max-width: 1920px;
  margin: 0 auto;
  width: 100%;
}}

@media (min-width: 1280px) {{
  .dashboard-grid {{
    grid-template-columns: repeat(3, 1fr);
  }}
  .panel-state {{ grid-column: 1 / -1; }}
}}

.panel {{
  background: var(--tisly-panel);
  border-radius: 12px;
  padding: var(--grid-gap);
  border: 1px solid rgba(0, 200, 180, 0.15);
}}

.panel h2 {{
  font-size: clamp(1rem, 1.8vw, 1.5rem);
  margin-bottom: 0.75rem;
  color: var(--tisly-accent);
}}

.panel h2 .count {{
  font-size: 0.75em;
  color: var(--tisly-muted);
  font-weight: normal;
}}

.device-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}}

.device-card {{
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-left: 4px solid var(--tisly-muted);
}}

.signal-alarm {{ border-left-color: var(--tisly-alarm); }}
.signal-motion {{ border-left-color: var(--tisly-motion); }}
.signal-contact {{ border-left-color: var(--tisly-contact); }}
.signal-output {{ border-left-color: var(--tisly-output); }}

.device-card.active-alarm {{ background: rgba(255,71,87,0.2); }}
.device-card.active-motion {{ background: rgba(255,165,2,0.2); }}
.device-card.active-contact {{ background: rgba(55,66,250,0.2); }}
.device-card.active-output {{ background: rgba(46,213,115,0.2); }}

.device-name {{ font-weight: 600; }}
.device-plc {{ font-size: 0.8em; color: var(--tisly-muted); font-family: monospace; }}
.device-status {{ font-size: 0.85em; }}

.state-summary {{ display: flex; flex-wrap: wrap; gap: 1rem; }}
.state-item span {{ display: block; color: var(--tisly-muted); font-size: 0.85em; }}
.state-item code {{ font-family: monospace; color: var(--tisly-accent); }}

.empty {{ color: var(--tisly-muted); font-style: italic; }}

.app-footer {{
  text-align: center;
  padding: 1rem;
  color: var(--tisly-muted);
  font-size: 0.8em;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}}

/* Google TV / 大画面向け */
@media (min-width: 1920px) {{
  :root {{
    --font-base: 22px;
    --font-title: 3rem;
  }}
  .device-grid {{
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }}
}}
"""


def generate_manifest(ctx: UiDashboardContext) -> str:
    slug = _slug(ctx.project_name or f"device-{ctx.device_id}")
    payload = {
        "name": f"TiSLY — {ctx.project_name}",
        "short_name": "TiSLY",
        "description": f"TiSLY Dashboard for {ctx.project_name}",
        "start_url": "./index.html",
        "display": "standalone",
        "background_color": "#0a1628",
        "theme_color": "#0a1628",
        "orientation": "any",
        "lang": "ja",
        "id": f"tisly-ui-{slug}",
        "categories": ["utilities", "productivity"],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def generate_service_worker() -> str:
    return f"""// {BUILDER_LABEL}
const CACHE = "tisly-ui-v1";
const ASSETS = ["./", "./index.html", "./app.js", "./styles.css", "./manifest.webmanifest", "./UI_CONFIG.json"];

self.addEventListener("install", (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
}});

self.addEventListener("fetch", (e) => {{
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
}});
"""


def generate_ui_readme(ctx: UiDashboardContext) -> str:
    return f"""# TiSLY UI Dashboard — {ctx.project_name}

**{BUILDER_LABEL}**

## 概要

案件 `{ctx.project_name}` 向け PWA ダッシュボードです。  
MQTT 状態（警報 / 動体 / 接点 / 出力）をリアルタイム表示します。

## ファイル構成

| ファイル | 説明 |
|----------|------|
| index.html | メインダッシュボード |
| app.js | MQTT / UI ロジック |
| styles.css | TiSLY ダークテーマ（Google TV 対応） |
| manifest.webmanifest | PWA マニフェスト |
| sw.js | Service Worker（オフラインキャッシュ） |
| UI_CONFIG.json | ブローカー / トピック / デバイス定義 |

## デプロイ

1. `TISLY/UI/` フォルダを Web サーバーまたは Node-RED `http static` に配置
2. `UI_CONFIG.json` の `mqtt.broker` / `ws_port` を現地環境に合わせて編集
3. ブラウザで `index.html` を開く（PWA としてホーム画面追加可能）
4. Google TV / Chromecast では Chrome で同 URL を全画面表示

## MQTT トピック

| 種別 | トピック |
|------|----------|
| 状態 | `{ctx.state_topic}` |
| 警報 | `{ctx.alarm_topic}` |
| 動体 | `{ctx.motion_topic}` |
| 出力 | `{ctx.output_topic}` |
| コマンド | `{ctx.cmd_topic}` |

## Node-RED 連携

`TISLY_FLOWS.json` を Node-RED にインポート後、本 UI と同一ブローカー `{ctx.mqtt_broker}` を使用してください。

---

*{BUILDER_LABEL}*
"""


def write_ui_dashboard_files(project_dir: Path) -> dict[str, Path]:
    """TISLY/UI/ 配下に PWA ダッシュボード一式を書き出す。"""
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
    ui_dir.mkdir(parents=True, exist_ok=True)

    writers = {
        "UI_CONFIG.json": generate_ui_config_json(ctx),
        "index.html": generate_index_html(ctx),
        "app.js": generate_app_js(ctx),
        "styles.css": generate_styles_css(ctx),
        "manifest.webmanifest": generate_manifest(ctx),
        "sw.js": generate_service_worker(),
        "UI_README.md": generate_ui_readme(ctx),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = ui_dir / name
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


# --- 監査 ---

def ui_config_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return (
        isinstance(data, dict)
        and "mqtt" in data
        and "topics" in data
        and "devices" in data
        and data.get("ui", {}).get("pwa") is True
    )


def ui_html_has_project(text: str) -> bool:
    return "tisly-ui" in text and "dashboard-grid" in text


def ui_html_has_device_cards(text: str) -> bool:
    return "device-card" in text


def ui_manifest_valid(text: str) -> bool:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    return data.get("display") == "standalone" and "start_url" in data


def ui_sw_has_cache(text: str) -> bool:
    return "caches.open" in text and "fetch" in text


def ui_readme_has_deploy(text: str) -> bool:
    return "## デプロイ" in text and "MQTT" in text


def audit_ui_dashboard(project_dir: Path) -> list[tuple[str, bool, str]]:
    """TISLY/UI/ 監査。戻り値: (name, passed, detail)。"""
    ui_dir = project_dir / "TISLY" / "UI"
    index_path = ui_dir / "index.html"
    config_path = ui_dir / "UI_CONFIG.json"
    manifest_path = ui_dir / "manifest.webmanifest"
    sw_path = ui_dir / "sw.js"
    readme_path = ui_dir / "UI_README.md"

    index_text = index_path.read_text(encoding="utf-8") if index_path.is_file() else ""
    config_text = config_path.read_text(encoding="utf-8") if config_path.is_file() else ""
    manifest_text = manifest_path.read_text(encoding="utf-8") if manifest_path.is_file() else ""
    sw_text = sw_path.read_text(encoding="utf-8") if sw_path.is_file() else ""
    readme_text = readme_path.read_text(encoding="utf-8") if readme_path.is_file() else ""

    all_exist = all((ui_dir / f).is_file() for f in UI_FILES)

    return [
        ("TISLY/UI/ 存在", ui_dir.is_dir(), "OK" if ui_dir.is_dir() else "フォルダなし"),
        (
            "UI 全ファイル (7)",
            all_exist,
            f"{sum(1 for f in UI_FILES if (ui_dir / f).is_file())}/{len(UI_FILES)}",
        ),
        ("index.html ダッシュボード", ui_html_has_project(index_text), "OK" if ui_html_has_project(index_text) else "NG"),
        (
            "index.html デバイスカード",
            ui_html_has_device_cards(index_text),
            "OK" if ui_html_has_device_cards(index_text) else "NG",
        ),
        ("UI_CONFIG.json 妥当性", ui_config_valid(config_text), "OK" if ui_config_valid(config_text) else "NG"),
        ("manifest.webmanifest PWA", ui_manifest_valid(manifest_text), "OK" if ui_manifest_valid(manifest_text) else "NG"),
        ("sw.js Service Worker", ui_sw_has_cache(sw_text), "OK" if ui_sw_has_cache(sw_text) else "NG"),
        ("UI_README.md デプロイ手順", ui_readme_has_deploy(readme_text), "OK" if ui_readme_has_deploy(readme_text) else "NG"),
    ]
