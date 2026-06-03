# Survey Workbox / Offline Sync

## クライアント (Phase 501–520)

`server/public/js/survey.js`

- キュー: `localStorage` key `tisly_survey_offline_queue_v501`
- 対象: 写真・メモ・チェックリスト・図面・GPS
- `online` イベント / 手動「オフライン同期」で flush

## サーバー

`POST /api/survey/sync`

```json
{
  "projectId": "SVY-XXXXXXXX",
  "items": [
    { "type": "photo", "photoType": "inside", "imageBase64": "...", "fileName": "x.jpg" },
    { "type": "memo", "notes": "..." },
    { "type": "checklist", "checklist": { } },
    { "type": "drawing", "imageBase64": "...", "fileName": "sketch.png" },
    { "type": "gps", "gpsLat": 35.0, "gpsLng": 139.0 }
  ]
}
```

実装: `server/src/survey/survey-sync.ts`

Phase 521+: IndexedDB + Background Sync / Workbox 本導入。
