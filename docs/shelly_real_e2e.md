# Shelly 実機 E2E（Phase941）

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SHELLY_MODE` | `mock` / `real` | 実 RPC の有無 |
| `SHELLY_BASE_URL` | `http://192.168.x.x` | Gen3/Plus のベース URL |
| `SHELLY_AUTH_TOKEN` | 任意 | Bearer 認証（ローカル/クラウド） |

## API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/shelly/status` | 状態取得（mock は固定値） |
| POST | `/api/shelly/reboot` | 再起動（real は `confirm:true` 必須） |
| POST | `/api/shelly/toggle` | リレー ON/OFF |

### real モードのガード

- `confirm: true` が無いと **403**
- `dryRun: true` なら RPC を送らず結果のみ返す

```json
POST /api/shelly/reboot
{ "confirm": true, "dryRun": false }
```

## 確認 URL

- http://localhost:3080/api/shelly/status
- 営業: http://localhost:3080/sales → Shelly 再起動デモ
