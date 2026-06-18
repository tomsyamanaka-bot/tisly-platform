# Google カレンダー同期 — LOCKED

**ロック日:** 2026-06-18  
**基準 commit:** `d045059`  
**状態:** ✅ **LOCKED**（本番実運用テスト合格）

---

## ロック条件（すべて達成）

| 項目 | 状態 |
|------|------|
| OAuth 接続（live） | ✅ |
| `lastOAuthError` | `null` |
| `lastSyncError` | `null` |
| `/google-calendar-settings-v1` 同期成功表示 | ✅ |
| `/schedule-v1` 同期成功表示 | ✅ |
| UNIQUE constraint failed 再発 | なし |
| TiSLY → Google 作成 | ✅ |
| TiSLY → Google 更新 | ✅ |
| TiSLY → Google 削除 | ✅ |
| Google → TiSLY pull 反映 | ✅ |
| フル同期 2 回連続 | ✅（`duplicateRisk: null`） |

## 検証レポート

- 本番双方向テスト: `server/data/google-bidirectional-sync-test/verification-report.json`
- 単体テスト: `server/test/google-calendar-sync-v1.test.ts`

## 変更禁止（退行防止）

以下を変更する場合は **新 Phase** として扱い、本ファイルの LOCK を解除して再検証すること:

- `server/src/schedule/google-calendar-sync-service.ts`
- `server/src/schedule/google-calendar-sync-store.ts`
- `server/src/services/googleOAuthService.ts`
- `server/public/js/google-calendar-settings-v1.js`
- `server/public/js/google-calendar-oauth-ui.js`
- `google_calendar_event_links` テーブルスキーマ

## 本番確認 URL

- https://tisly.jp/google-calendar-settings-v1
- https://tisly.jp/schedule-v1
- https://tisly.jp/api/google-calendar/status
