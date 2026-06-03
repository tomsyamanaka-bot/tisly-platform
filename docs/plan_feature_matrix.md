# プラン別機能マトリクス

| 機能 | Lite | Standard | PRO | PRO_REMOTE |
|------|:----:|:--------:|:---:|:----------:|
| PWA | ✓ | ✓ | ✓ | ✓ |
| 外部通知 | — | — | ✓ | ✓ |
| LAN 運用 | — | ✓ | ✓ | ✓ |
| 基本ログ | — | ✓ | ✓ | ✓ |
| 通知 | — | — | ✓ | ✓ |
| Recovery | — | — | ✓ | ✓ |
| AI 簡易 | — | — | ✓ | ✓ |
| 顧客ポータル | — | — | — | ✓ |
| TV ダッシュボード | — | — | — | ✓ |
| QNAP | — | — | — | ✓ |
| AI フル / 営業レポート | — | — | — | ✓ |
| SOC/NOC | — | — | — | ✓ |
| 遠隔保守 | — | — | — | ✓ |

実装: `server/src/customer/plan-guard.ts` — API で `403 Plan restriction` を返す。

## デモ顧客

- **TOMS001** → PRO_REMOTE
- **HOTEL001** → PRO
- **PLANT001** → Standard
