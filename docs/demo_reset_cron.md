# デモリセット cron（Phase945）

## 環境変数

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `DEMO_RESET_ENABLED` | `false` | `true` で node-cron 起動 |
| `DEMO_RESET_CRON` | `0 6 * * *` | cron 式（毎朝6時） |
| `DEMO_RESET_TZ` | `Asia/Tokyo` | タイムゾーン |

## API

| メソッド | パス |
|----------|------|
| GET | `/api/demo-kit/reset-schedule` |
| PUT | `/api/demo-kit/reset-schedule` |
| POST | `/api/demo-kit/reset`（手動、常に利用可） |

## リセット内容

timeline / floorMaps / KPI / notifications / devices メタ → 再シード

実装: `server/src/demo-kit/demo-reset-cron.ts`
