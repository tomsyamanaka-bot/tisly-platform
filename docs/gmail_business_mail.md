# Gmail Business Mail

## 現状

- `server/src/business/services/gmailService.ts`
- デフォルト宛先: `toms.yamanaka@gmail.com`
- 添付: QNAPパス + `/attachments/placeholder/*.pdf`（placeholder）

## メール種別

| API | type |
|-----|------|
| `mail/estimate-ready` | `estimate_ready` |
| `mail/completion-ready` | `completion_ready` |
| `mail/invoice-ready` | `invoice_ready` |

## 本番差し替え

`setGmailProvider()` で Gmail API 実装を注入。
