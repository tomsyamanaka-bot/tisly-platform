# Live Device Bridge（Phase 901）

## deviceMode

| モード | 説明 |
|--------|------|
| `mock` | デモ仮想デバイス・Shelly telemetry モック |
| `esp` | MQTT / HTTP heartbeat から ESP を実機扱い |
| `shelly` | Shelly Gen3 RPC（`http://{ip}/rpc/Shelly.GetStatus`） |
| `mixed` | ESP 実機 + Shelly mock 併用（PoC 向け） |

## API

- `GET /api/demo-kit/device-mode`
- `PUT /api/demo-kit/device-mode` — body: `{ "deviceMode": "mixed" }`

## 実装

- `server/src/device/device-mode-store.ts`
- `server/src/device/device-adapter.ts` — 全 UI が参照する統一デバイスビュー

## 環境変数

- `TISLY_DEVICE_MODE` — 起動時の初期モード（省略時は `mock`）
