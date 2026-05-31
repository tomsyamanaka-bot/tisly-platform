# TiSLY 営業デモパッケージ — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.19 — End-to-End Demo Package**

## 概要

本フォルダは案件 `CARSHOP_NIGHT_SECURITY` の **End-to-End 営業デモ一式** です。  
PLC・Node-RED・PWA・TV・見積・現調報告をまとめて提示できます。

## 構成

| フォルダ / ファイル | 内容 |
|---------------------|------|
| PLC/ | GX Works3 命令・PLC プログラム |
| TISLY/ | MQTT / ESP / Node-RED / UI / TV |
| SPEC/ | 仕様書 / 見積 / BOM |
| SURVEY/ | 現調報告書 |
| DEMO_CHECKLIST.md | デモ実施チェックリスト |

## デモ手順

1. **PLC** … `PLC/GX3_COMMANDS.txt` を GX Works3 シミュレータで確認
2. **Node-RED** … `TISLY/TISLY_FLOWS.json` をインポート
3. **PWA** … `TISLY/UI/index.html` をブラウザで表示
4. **TV** … `TISLY/UI/tv.html` を Google TV で全画面表示
5. **見積** … `SPEC/TOMS_QUOTE_SUMMARY.md` を提示
6. **現調** … `SURVEY/TOMS_SITE_REPORT.md` を説明

## 注意

- デモ環境では MQTT ブローカー未接続時はデモモードで動作します
- 正式見積・施工前に現地確認が必要です

---

*生成日時: 2026-05-31 06:05 UTC*
*TiSLY PLC Builder v5.19 — End-to-End Demo Package*
