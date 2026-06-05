# Phase 1201–1240 — RC2 Pre-Production Deploy Foundation

**tisly.jp 本番公開前のデプロイ基盤固め**

## 成果物

| 項目 | パス |
|------|------|
| 本番 URL 構成 | `docs/production_routes.md` |
| VPS デプロイ Runbook | `docs/tisly_jp_deploy_runbook.md` |
| Mock/Real 切替一覧 | `docs/mock_real_modes.md` |
| RC2 公開前チェックリスト | `docs/rc2_pre_deploy_checklist.md` |
| 起動前 env checker | `server/src/config/production-env-checker.ts` |
| 本番ルート定義 | `server/src/config/production-routes.ts` |
| テスト | `server/test/phase1201-1240.test.ts` |

## 1案件フロー（RC2 完了済み）

現調 → AI見積 → Business → 施工 → PRO Remote → Google TV → 引き渡し

本フェーズは **公開手順・env・権限・テスト** を固める。

## 起動前 env チェック

`server/src/index.ts` 起動時に `logProductionEnvWarnings()` を実行。

チェック対象: `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `TISLY_PUBLIC_URL`,
`MQTT_URL`, `GOOGLE_OAUTH_ENABLED`, `QNAP_UPLOAD_MODE`, `SHELLY_MODE`, `DB_PROVIDER` 等。

## テスト

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

`phase1201-1240.test.ts` — env checker · route list · RC2 checklist 項目
