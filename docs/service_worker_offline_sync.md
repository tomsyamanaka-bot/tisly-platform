# Service Worker オフライン同期（Phase 381–400）

## 概要

施工 PWA (`/customer/:code/install`) は `service-worker.js` でシェル資産をキャッシュし、オフラインキュー同期の **Background Sync プレースホルダ** を提供します。

## 対象アクション（クライアントキュー → `install/sync`）

| クライアント | サーバー action |
|--------------|-----------------|
| qrClaim | qr_claim |
| nfcClaim | nfc_claim |
| mapPlacement | map_placement |
| checklist | checklist_complete |
| photo | photo_upload（本体はライブ upload 推奨） |

## 実装

| 層 | ファイル |
|----|----------|
| SW | `server/public/service-worker.js` |
| キュー | `localStorage` `tisly_installer_queue_{CODE}` |
| 手動 flush | Offline Status バー / 「同期」ボタン |
| API | `POST /api/customer/:code/install/sync` |

## Background Sync

- タグ: `tisly-installer-sync`
- SW は `FLUSH_OFFLINE_QUEUE` をクライアントへ postMessage
- 認証付き API はページ側で flush（JWT は SW に保持しない）

## 同期結果 UI

- `applied` / `rejected` / `skipped` / `conflict` / `merged`（手動マージ placeholder）
