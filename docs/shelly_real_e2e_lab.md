# Shelly 実機 E2E ラボ（Phase 981–1000）

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SHELLY_MODE` | `mock` / `real` | mock=シミュレーション、real=RPC 実機 |
| `SHELLY_BASE_URL` | `http://192.168.x.x` | Gen3 RPC ベース（real 時必須） |
| `SHELLY_AUTH_TOKEN` | 任意 | Bearer 認証 |

## API

- `GET /api/shelly/status` — env ベースの接続状態（online, relay, uptime, wifi RSSI, temperature）
- `POST /api/shelly/reboot` — `{ confirm: true }` 必須（real）
- `POST /api/shelly/toggle` — 同上
- `GET /api/demo-kit/shelly/lab-status` — 営業デモ用サマリ（失敗時 **mock にフォールバックしない**）
- `GET /api/demo-kit/shelly/telemetry/:deviceId` — 詳細テレメトリ
- `POST /api/demo-kit/shelly/poll` — 登録デバイス一括ポーリング

## UI

- `/sales` — Shelly 接続メッセージ + REAL/MOCK バッジ
- `/devices` — Shelly 列・lab-status

## 安全

real モードで `reboot` / `toggle` は `confirm: true` または `dryRun: true` のみ実行。
