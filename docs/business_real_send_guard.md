# real送信ガード

`platform_settings.business_real_send_settings`

| フラグ | 意味 |
|--------|------|
| `dryRun` | 実送信ブロック（ログのみ） |
| `mockOnly` | mock 以外拒否 |
| `realSendEnabled` | 本番送信許可 |

対象: Gmail送信、Calendar登録、QNAP real upload、Web Push（mock 送信も確認推奨）

## API

`PATCH /api/business/settings/real-send`

## UI

`/business/settings` — チェックボックス + 保存。各危険操作は `confirmRealSend()` ダイアログ。

real API には `confirmed: true` を付与。
