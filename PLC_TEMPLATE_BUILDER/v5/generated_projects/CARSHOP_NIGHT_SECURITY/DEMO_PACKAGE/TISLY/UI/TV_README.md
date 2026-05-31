# TiSLY Google TV Launcher — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.17 — Google TV Launcher Template**

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
| 状態 | `tisly/device/211/state` |
| 警報 | `tisly/device/211/alarm` |
| 動体 | `tisly/device/211/motion` |
| 出力 | `tisly/device/211/output` |

## 関連

- スマホ PWA: `index.html`
- Node-RED: `TISLY_FLOWS.json`

---

*TiSLY PLC Builder v5.17 — Google TV Launcher Template*
