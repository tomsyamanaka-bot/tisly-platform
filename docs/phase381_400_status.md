# Phase 381–400 ステータス — Production Sync & Device Certificate Pipeline

## 完了

| # | 項目 | 状態 |
|---|------|------|
| 1 | Service Worker オフライン同期 | ✅ |
| 2 | 実 MQTT RTT（.env 時 probe、未設定 mock） | ✅ |
| 3 | CSR / cert API placeholder | ✅ |
| 4 | ESP/RP2350 ドキュメント | ✅ |
| 5 | 施工写真 upload/list/delete | ✅ |
| 6 | QNAP/S3 設計 + placeholder | ✅ |
| 7 | PWA 多言語 ja/en | ✅ |
| 8 | Offline Status バー | ✅ |
| 9 | 手動マージ UI placeholder | ✅ |
| 10 | ラベル CSV/SVG/JSON 強化 | ✅ |
| 11 | 完了レポート強化 | ✅ |
| 12 | Installer Dashboard | ✅ |
| 13 | Security（tenant/installer/audit/rate/dry-run） | ✅ |
| 14 | `installer-production-sync.test.ts` | ✅ |

## デモ

- `/customer/TOMS001/install` — `toms001.installer`
- `MQTT_URL` 未設定 → RTT mock
- `STORAGE_PROVIDER=local` デフォルト

## Phase 401–420 候補

- 実機 Background Sync + JWT リフレッシュ
- ブローカー ACL とデバイス ack トピック本番
- ACME / 社内 CA 連携
- S3 本番アップロード + QNAP ミラー
- テプラ/Brother 印刷 SDK
