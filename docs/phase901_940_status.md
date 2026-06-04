# Phase 901–940 — Live Device Bridge & Sales Ready RC1

| # | 項目 | 状態 |
|---|------|------|
| 1 | Device Adapter Layer（mock / esp / shelly / mixed） | ✅ |
| 2 | `/devices` デバイス一覧 | ✅ |
| 3 | Shelly Gen3 ブリッジ（IP・telemetry・mock切替） | ✅ |
| 4 | ESP MQTT Heartbeat → KPI | ✅ |
| 5 | 営業画面 Mock / Real / Mixed 切替 | ✅ |
| 6 | PRO Remote 図面ライブピン（緑/黄/赤） | ✅ |
| 7 | ワンクリックデモパッケージ（5業種） | ✅ |
| 8 | ROI Simulator v2 + グラフ | ✅ |
| 9 | Demo Movie Mode | ✅ |
| 10 | build / tsc / test | ✅ |
| 11 | ドキュメント | ✅ |

## API 追加（`/api/demo-kit`）

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/status` | phase `901-940`, deviceBridge, espHeartbeat |
| GET/PUT | `/device-mode` | mock / esp / shelly / mixed |
| GET | `/devices/registry` | デバイス一覧 |
| GET/PUT | `/shelly/config`, `/shelly/configs` | Shelly 設定 |
| GET | `/shelly/telemetry/:deviceId` | リレー・電圧・電流・電力 |
| POST | `/shelly/poll` | Shelly 一括ポーリング |
| GET | `/esp-heartbeat/kpi` | ESP 死活 KPI |
| GET | `/floor-preview-live/:customerCode` | ライブピン色 |
| GET | `/demo-packages` | 業種テンプレ一覧 |
| POST | `/demo-packages/:type/launch` | ワンクリックデモ |
| POST | `/roi-simulator` | ROI v2 計算 |
| GET/POST | `/demo-movie`, `/demo-movie/start`, `/demo-movie/stop` | 展示会自動再生 |

## 画面

| URL | 用途 |
|-----|------|
| `/sales` | 営業デモ（モード切替・ROI・ムービー） |
| `/devices` | デバイス Registry |
| `/sales/floor-preview` | ライブ図面（15秒ポーリング） |

## テスト

- `server/test/business-phase901.test.ts`

## ドキュメント

- [live_bridge.md](./live_bridge.md)
- [device_registry.md](./device_registry.md)
- [shelly_bridge.md](./shelly_bridge.md)
- [pro_remote_live.md](./pro_remote_live.md)
- [customer_demo_package.md](./customer_demo_package.md)
- [roi_simulator_v2.md](./roi_simulator_v2.md)
- [demo_movie_mode.md](./demo_movie_mode.md)

## Phase 941–980 提案

1. Shelly 実機 E2E（CI スキップ付き integration test）
2. ESP32 ファームウェア ↔ 本番 MQTT トピック固定
3. 営業デモの WebSocket リアルタイム（ポーリング廃止）
4. Puppeteer 見積 PDF + QNAP 自動配置
5. Google TV デモ通知ミラー
6. node-cron デモリセット本番化
7. 多言語営業 UI（EN / 中文）
8. `/sales` オフライン PWA キャッシュ
