# TiSLY QNAP Integration（Phase 81–100）

## 概要

イベント・レポートの長期保管と、カメラアーカイブの設計を担います。  
デモ環境では `data/qnap-archive/` へ JSON/CSV を出力します。

## モジュール

| パス | 内容 |
|------|------|
| `server/src/qnap/event-archive.ts` | イベント JSON/CSV アーカイブ |
| `server/src/qnap/backup-manager.ts` | 日次 / 週次 / 月次バックアップ |
| `server/src/qnap/auto-export.ts` | CSV・Excel互換・顧客週報/月報 |
| `server/src/qnap/qnap-client.ts` | 統合 API |

## カメラアーカイブ（設計）

| 項目 | 内容 |
|------|------|
| プロバイダ | H.View, Reolink |
| 保存先 | QNAP Surveillance Station / SMB |
| 保持 | 30 日（構想） |
| 状態 | design_only |

## API

- `GET /api/qnap/status`
- `POST /api/qnap/archive` — `{ format: "json"|"csv", days }`
- `POST /api/qnap/backup/:schedule` — daily | weekly | monthly
- `POST /api/qnap/export`
- `GET /api/qnap/report/:type` — weekly | monthly

## 環境変数（本番）

- `QNAP_HOST` — NAS ホスト（未設定時はローカルアーカイブのみ）

## 将来連携

- QNAP SMB/API 直接書き込み
- Camera AI 連携
