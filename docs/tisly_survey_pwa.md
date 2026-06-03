# Survey PWA（現調）

## URL

- `/survey`
- Manifest: `/manifest-survey.webmanifest`

## 機能（Phase 461–480）

- 案件作成（ローカル保存）
- 航空写真・外観・室内・手書き図面・分電盤・ネット回線写真
- メモ
- AI解析（placeholder）
- 見積候補（placeholder）

## ロール

- **surveyor**: App Hub で現調のみ
- **admin / owner / manager**: 現調カードあり

## クライアント

- `server/public/survey.html`
- `server/public/js/survey.js`
- ロールガード: `GET /api/pwa/access/survey`

## 今後

Phase 501+ で API 連携・写真アップロード・AI 解析本実装。
