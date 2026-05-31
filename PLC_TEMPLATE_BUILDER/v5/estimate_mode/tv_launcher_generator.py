#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.17 — Google TV Launcher Template
NODE_RED_CONFIG.json / DEVICE_MAP / MQTT_TOPICS から
Google TV / Android TV 向け 10-foot UI（TISLY/UI/tv.html）を自動生成する。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ui_dashboard_generator import (
    UiDashboardContext,
    build_ui_context,
)

VERSION = "v5.17"
BUILDER_LABEL = f"TiSLY PLC Builder {VERSION} — Google TV Launcher Template"

TV_FILES = (
    "tv.html",
    "tv.css",
    "tv.js",
    "TV_README.md",
)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "tisly"


def _tv_cards_html(devices: list, css_class: str) -> str:
    if not devices:
        return '<p class="tv-empty">— なし —</p>'
    cards = []
    for d in devices:
        cards.append(
            f'<article class="tv-card {css_class}" data-device="{d.name}" tabindex="0">'
            f'<h3 class="tv-card-title">{d.name}</h3>'
            f'<span class="tv-card-plc">{d.plc}</span>'
            f'<span class="tv-card-status" aria-live="polite">待機中</span>'
            f"</article>"
        )
    return "\n".join(cards)


def generate_tv_html(ctx: UiDashboardContext) -> str:
    slug = _slug(ctx.project_name or f"device-{ctx.device_id}")
    alarm_cards = _tv_cards_html(ctx.alarms, "tv-alarm")
    motion_cards = _tv_cards_html(ctx.motions, "tv-motion")
    output_cards = _tv_cards_html(ctx.outputs, "tv-output")
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#000000">
  <meta name="description" content="TiSLY TV Launcher — {ctx.project_name}">
  <title>TiSLY TV — {ctx.project_name}</title>
  <link rel="stylesheet" href="tv.css">
</head>
<body class="tv-launcher" data-project="{slug}">
  <header class="tv-header">
    <div class="tv-brand">
      <span class="tv-logo">TiSLY</span>
      <h1>{ctx.project_name}</h1>
    </div>
    <div class="tv-status-bar">
      <span id="tv-conn" class="tv-badge offline">未接続</span>
      <span class="tv-device-id">Device {ctx.device_id}</span>
      <time id="tv-clock">—</time>
    </div>
  </header>

  <main class="tv-main">
    <section class="tv-row tv-row-hero" aria-label="システム概要">
      <div class="tv-hero-card">
        <h2>システム状態</h2>
        <div class="tv-hero-grid">
          <div class="tv-stat"><span>Broker</span><strong>{ctx.mqtt_broker}</strong></div>
          <div class="tv-stat"><span>Topic</span><strong>{ctx.base_topic}</strong></div>
          <div class="tv-stat"><span>警報</span><strong id="tv-alarm-count">{len(ctx.alarms)}</strong></div>
          <div class="tv-stat"><span>動体</span><strong id="tv-motion-count">{len(ctx.motions)}</strong></div>
        </div>
      </div>
      <div class="tv-camera-frame" aria-label="カメラ表示枠">
        <div class="tv-camera-placeholder">
          <span class="tv-camera-icon">📷</span>
          <p>カメラ映像</p>
          <small>RTSP / WebRTC 連携予定</small>
        </div>
      </div>
    </section>

    <section class="tv-row" aria-labelledby="tv-alarms">
      <h2 id="tv-alarms" class="tv-section-title">警報 <span class="tv-count">{len(ctx.alarms)}</span></h2>
      <div class="tv-card-row">{alarm_cards}</div>
    </section>

    <section class="tv-row" aria-labelledby="tv-motion">
      <h2 id="tv-motion" class="tv-section-title">動体検知 <span class="tv-count">{len(ctx.motions)}</span></h2>
      <div class="tv-card-row">{motion_cards}</div>
    </section>

    <section class="tv-row" aria-labelledby="tv-outputs">
      <h2 id="tv-outputs" class="tv-section-title">出力 <span class="tv-count">{len(ctx.outputs)}</span></h2>
      <div class="tv-card-row">{output_cards}</div>
    </section>
  </main>

  <footer class="tv-footer">
    <span>{BUILDER_LABEL}</span>
    <span>Google TV / Android TV Leanback 10-foot UI</span>
  </footer>

  <script src="tv.js" type="module"></script>
</body>
</html>
"""


def generate_tv_css(ctx: UiDashboardContext) -> str:
    return f"""/* {BUILDER_LABEL} — Leanback 10-foot UI */
:root {{
  --tv-bg: #000000;
  --tv-surface: #1a1a1a;
  --tv-card: #222222;
  --tv-focus: #00c8b4;
  --tv-alarm: #ff4757;
  --tv-motion: #ffa502;
  --tv-output: #2ed573;
  --tv-text: #ffffff;
  --tv-muted: #888888;
  --tv-gap: clamp(1rem, 2vw, 2rem);
  --tv-font: clamp(18px, 2vw, 28px);
  --tv-title: clamp(2rem, 4vw, 4rem);
}}

* {{ box-sizing: border-box; margin: 0; padding: 0; }}

body.tv-launcher {{
  font-family: "Roboto", "Segoe UI", "Hiragino Sans", sans-serif;
  background: var(--tv-bg);
  color: var(--tv-text);
  font-size: var(--tv-font);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}}

.tv-header {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--tv-gap) calc(var(--tv-gap) * 1.5);
  background: var(--tv-surface);
  border-bottom: 3px solid var(--tv-focus);
}}

.tv-logo {{
  color: var(--tv-focus);
  font-weight: 700;
  font-size: 1.2em;
  letter-spacing: 0.1em;
  margin-right: 1rem;
}}

.tv-header h1 {{ font-size: var(--tv-title); display: inline; }}

.tv-status-bar {{ display: flex; gap: 1.5rem; align-items: center; font-size: 0.9em; }}

.tv-badge {{
  padding: 0.4em 1em;
  border-radius: 4px;
  font-weight: 600;
}}
.tv-badge.offline {{ background: #333; color: #aaa; }}
.tv-badge.online {{ background: var(--tv-output); color: #000; }}

.tv-main {{
  flex: 1;
  padding: var(--tv-gap);
  max-width: 3840px;
  margin: 0 auto;
  width: 100%;
}}

.tv-row {{ margin-bottom: calc(var(--tv-gap) * 1.5); }}

.tv-row-hero {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--tv-gap);
}}

@media (max-width: 1280px) {{
  .tv-row-hero {{ grid-template-columns: 1fr; }}
}}

.tv-hero-card {{
  background: var(--tv-surface);
  border-radius: 16px;
  padding: var(--tv-gap);
  border: 2px solid rgba(0, 200, 180, 0.2);
}}

.tv-hero-card h2 {{
  color: var(--tv-focus);
  font-size: 1.5em;
  margin-bottom: 1rem;
}}

.tv-hero-grid {{
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}}

.tv-stat span {{ display: block; color: var(--tv-muted); font-size: 0.85em; }}
.tv-stat strong {{ font-size: 1.3em; font-family: monospace; color: var(--tv-focus); }}

.tv-camera-frame {{
  background: var(--tv-surface);
  border-radius: 16px;
  overflow: hidden;
  border: 2px solid #333;
  min-height: 280px;
}}

.tv-camera-placeholder {{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  color: var(--tv-muted);
  gap: 0.5rem;
}}

.tv-camera-icon {{ font-size: 4rem; opacity: 0.5; }}

.tv-section-title {{
  font-size: 1.8em;
  color: var(--tv-focus);
  margin-bottom: 1rem;
}}

.tv-section-title .tv-count {{
  font-size: 0.6em;
  color: var(--tv-muted);
  font-weight: normal;
}}

.tv-card-row {{
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scroll-snap-type: x mandatory;
}}

.tv-card {{
  flex: 0 0 min(320px, 40vw);
  background: var(--tv-card);
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 6px solid var(--tv-muted);
  scroll-snap-align: start;
  transition: transform 0.15s, box-shadow 0.15s;
}}

.tv-card:focus {{
  outline: 3px solid var(--tv-focus);
  transform: scale(1.03);
  box-shadow: 0 8px 32px rgba(0, 200, 180, 0.3);
}}

.tv-alarm {{ border-left-color: var(--tv-alarm); }}
.tv-motion {{ border-left-color: var(--tv-motion); }}
.tv-output {{ border-left-color: var(--tv-output); }}

.tv-card.active {{ background: rgba(255, 71, 87, 0.25); }}
.tv-motion.active {{ background: rgba(255, 165, 2, 0.25); }}
.tv-output.active {{ background: rgba(46, 213, 115, 0.25); }}

.tv-card-title {{ font-size: 1.2em; margin-bottom: 0.5rem; }}
.tv-card-plc {{ font-size: 0.8em; color: var(--tv-muted); font-family: monospace; }}
.tv-card-status {{ display: block; margin-top: 0.75rem; font-weight: 600; }}

.tv-empty {{ color: var(--tv-muted); font-style: italic; }}

.tv-footer {{
  text-align: center;
  padding: 1rem;
  color: var(--tv-muted);
  font-size: 0.75em;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}}

/* 1920px+ 10-foot UI */
@media (min-width: 1920px) {{
  :root {{
    --tv-font: 26px;
    --tv-title: 3.5rem;
  }}
  .tv-card {{ flex: 0 0 380px; padding: 2rem; }}
  .tv-camera-frame {{ min-height: 400px; }}
}}
"""


def generate_tv_js(ctx: UiDashboardContext) -> str:
    return f"""// {BUILDER_LABEL}
const TV_CONFIG = {{
  project: {json.dumps(ctx.project_name, ensure_ascii=False)},
  deviceId: {json.dumps(ctx.device_id)},
  mqtt: {{
    broker: {json.dumps(ctx.mqtt_broker)},
    wsPort: {ctx.ws_port},
  }},
  topics: {{
    state: {json.dumps(ctx.state_topic)},
    alarm: {json.dumps(ctx.alarm_topic)},
    motion: {json.dumps(ctx.motion_topic)},
    output: {json.dumps(ctx.output_topic)},
  }},
}};

const connEl = document.getElementById("tv-conn");
const clockEl = document.getElementById("tv-clock");

function updateClock() {{
  clockEl.textContent = new Date().toLocaleString("ja-JP");
}}
setInterval(updateClock, 1000);
updateClock();

function setTvConnection(online) {{
  connEl.textContent = online ? "MQTT 接続中" : "デモモード";
  connEl.classList.toggle("online", online);
  connEl.classList.toggle("offline", !online);
}}

function focusFirstCard() {{
  const first = document.querySelector(".tv-card");
  if (first) first.focus();
}}

document.addEventListener("keydown", (e) => {{
  const cards = [...document.querySelectorAll(".tv-card")];
  const idx = cards.indexOf(document.activeElement);
  if (e.key === "ArrowRight" && idx >= 0 && idx < cards.length - 1) {{
    e.preventDefault();
    cards[idx + 1].focus();
  }} else if (e.key === "ArrowLeft" && idx > 0) {{
    e.preventDefault();
    cards[idx - 1].focus();
  }}
}});

setTvConnection(false);
focusFirstCard();
console.info("[TiSLY TV] Configure MQTT WebSocket for live data.");
export {{ TV_CONFIG }};
"""


def generate_tv_readme(ctx: UiDashboardContext) -> str:
    return f"""# TiSLY Google TV Launcher — {ctx.project_name}

**{BUILDER_LABEL}**

## 概要

Google TV / Android TV 向け **10-foot UI** ランチャー画面です。  
Leanback 風レイアウト・黒背景・大きいカード・警報表示・カメラ表示枠を備えます。

## ファイル

| ファイル | 説明 |
|----------|------|
| tv.html | TV ランチャー本体 |
| tv.css | Leanback 10-foot スタイル |
| tv.js | リモコン操作 / MQTT 連携 |
| TV_README.md | 本ファイル |

## デプロイ

1. `TISLY/UI/` を Web サーバーに配置
2. Google TV の Chrome で `tv.html` を開く
3. 全画面表示（F11 または TV リモコンの全画面）
4. D-pad / 矢印キーでカード間を移動

## MQTT

| 種別 | トピック |
|------|----------|
| 状態 | `{ctx.state_topic}` |
| 警報 | `{ctx.alarm_topic}` |
| 動体 | `{ctx.motion_topic}` |
| 出力 | `{ctx.output_topic}` |

## 関連

- スマホ PWA: `index.html`
- Node-RED: `TISLY_FLOWS.json`

---

*{BUILDER_LABEL}*
"""


def write_tv_launcher_files(project_dir: Path) -> dict[str, Path]:
    """TISLY/UI/ 配下に Google TV ランチャー一式を書き出す。"""
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
        "tv.html": generate_tv_html(ctx),
        "tv.css": generate_tv_css(ctx),
        "tv.js": generate_tv_js(ctx),
        "TV_README.md": generate_tv_readme(ctx),
    }
    paths: dict[str, Path] = {}
    for name, content in writers.items():
        path = ui_dir / name
        path.write_text(content, encoding="utf-8")
        paths[name] = path
    return paths


def tv_html_valid(text: str) -> bool:
    return "tv-launcher" in text and "tv-card-row" in text and "tv-camera-frame" in text


def tv_css_leanback(text: str) -> bool:
    return "10-foot" in text or "tv-launcher" in text


def tv_js_has_config(text: str) -> bool:
    return "TV_CONFIG" in text and "ArrowRight" in text


def tv_readme_has_deploy(text: str) -> bool:
    return "Google TV" in text and "## デプロイ" in text


def audit_tv_launcher(project_dir: Path) -> list[tuple[str, bool, str]]:
    """TISLY/UI/ TV ランチャー監査。"""
    ui_dir = project_dir / "TISLY" / "UI"
    html_path = ui_dir / "tv.html"
    css_path = ui_dir / "tv.css"
    js_path = ui_dir / "tv.js"
    readme_path = ui_dir / "TV_README.md"

    html_text = html_path.read_text(encoding="utf-8") if html_path.is_file() else ""
    css_text = css_path.read_text(encoding="utf-8") if css_path.is_file() else ""
    js_text = js_path.read_text(encoding="utf-8") if js_path.is_file() else ""
    readme_text = readme_path.read_text(encoding="utf-8") if readme_path.is_file() else ""
    all_exist = all((ui_dir / f).is_file() for f in TV_FILES)

    return [
        ("TISLY/UI/tv.html 存在", html_path.is_file(), "OK" if html_path.is_file() else "なし"),
        ("TV 全ファイル (4)", all_exist, f"{sum(1 for f in TV_FILES if (ui_dir / f).is_file())}/{len(TV_FILES)}"),
        ("tv.html 10-foot UI", tv_html_valid(html_text), "OK" if tv_html_valid(html_text) else "NG"),
        ("tv.css Leanback", tv_css_leanback(css_text), "OK" if tv_css_leanback(css_text) else "NG"),
        ("tv.js リモコン操作", tv_js_has_config(js_text), "OK" if tv_js_has_config(js_text) else "NG"),
        ("TV_README.md デプロイ", tv_readme_has_deploy(readme_text), "OK" if tv_readme_has_deploy(readme_text) else "NG"),
    ]
