# 実機 ID ルール（Phase 101–120）

## 命名規則

```
{機種}-{現場種別}-{連番}
```

- **機種**: ハードウェア / 役割の略称（大文字・ハイフン区切り）
- **現場種別**: 設置コンテキスト（HOME, FACTORY, LOBBY 等）
- **連番**: 3 桁ゼロ埋め（001, 002, …）

## 機種プレフィックス

| プレフィックス | 対象 | 例 |
|----------------|------|-----|
| `ESP` | ESP32 ゲートウェイ | `ESP-HOME-001` |
| `RP` | RP2350（DI/RO） | `RP-HOME-001` |
| `PLC` | 三菱 FX 等 PLC 連携ノード | `PLC-FACTORY-001` |
| `TV` | Google TV 端末 | `TV-LOBBY-001` |
| `QNAP` | NAS / アーカイブノード | `QNAP-MAIN-001` |
| `NR` | Node-RED インスタンス（任意） | `NR-VPS-001` |
| `PWA` | 登録ユーザー端末（通知用・任意） | `PWA-USER-001` |

## 現場種別（site_type 参考）

| コード | 意味 |
|--------|------|
| `HOME` | 戸建・住宅 |
| `FACTORY` | 工場 |
| `WAREHOUSE` | 倉庫 |
| `LOBBY` | ロビー・受付 |
| `MAIN` | 本社・メイン拠点 |
| `FARM` | 養殖・農業 |
| `SHOP` | 店舗・車屋 |

`site_id`（DB / MQTT）は英小文字スラッグ推奨: `moriya-home`, `factory-a`。

## 登録例

```json
POST /api/devices/register
{
  "deviceId": "ESP-HOME-001",
  "deviceType": "esp32",
  "platform": "esp-idf",
  "siteId": "moriya-home",
  "tenantId": "default",
  "label": "守谷住宅 — ESP ゲートウェイ"
}
```

## MQTT との対応

トピックの `{device_id}` は **この ID と完全一致**させる。

```
tisly/{tenant_id}/{site_id}/{device_id}/state
```

例: `tisly/default/moriya-home/ESP-HOME-001/event`

## 禁止・注意

- スペース・日本語は避ける（ログ・URL 安全）
- 同一 `device_id` の再登録は UPDATE（冪等）
- デモ用 `TEST-*` は本番テナントでは使わない

## マイグレーション

旧 ID（例: `rp2350-home-01`, `plc-fx-01`）は `docs/mqtt_unified_topics.md` の移行 TODO を参照。
