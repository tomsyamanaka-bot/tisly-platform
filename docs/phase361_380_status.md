# Phase 361–380 ステータス — Field Installer Hardening

## 完了

| # | 項目 | 状態 |
|---|------|------|
| 1 | QR カメラスキャン（BarcodeDetector + html5-qrcode） | ✅ |
| 2 | Web NFC / UID 手入力 | ✅ |
| 3 | オフラインキュー + `install/sync` | ✅ |
| 4 | 競合ルール | ✅ |
| 5 | 完了レポート HTML/PDF | ✅（PDF は Puppeteer 任意） |
| 6 | ラベル CSV / SVG | ✅ |
| 7 | MQTT RTT placeholder | ✅ |
| 8 | mTLS 設計 + placeholder | ✅ |
| 9 | Device trust 列 | ✅ |
| 10 | i18n 辞書 placeholder | ✅ |
| 11 | Dry Run モード | ✅ |
| 12 | install_sessions | ✅ |
| 13 | Installer audit 強化 | ✅ |
| 14 | Map Undo/Redo | ✅ |
| 15 | Map グリッド強化 | ✅ |
| 16 | `installer-field-hardening.test.ts` | ✅ |

## デモ顧客

TOMS001 / HOTEL001 / PLANT001 — installer ユーザー維持

## Phase 381–400 候補

- Service Worker バックグラウンド同期
- 実 MQTT RTT / ブローカー ACL
- テプラ / Brother 自動印刷
- 証明書 CSR 本番 API
- 施工写真の S3 / QNAP 本番
- 英語 UI 切替
