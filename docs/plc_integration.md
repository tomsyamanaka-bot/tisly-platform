# PLC 連携仕様（Phase 101–120）

## 役割分担

| レイヤ | 担当 | 責務 |
|--------|------|------|
| **PLC** | 現場制御 | リアルタイム I/O、ラッチ、安全回路、出力タイミング |
| **ESP32 / RP2350** | 通信・通知 | MQTT、heartbeat、HTTP ingest 経路、DI/RO 拡張 |
| **Node-RED** | 統合 | トピック変換、ingest、再送、将来の通知分岐 |
| **TiSLY server** | クラウド | イベント保存、通知、AI、Recovery、QNAP |

PLC は **最終的な物理出力の責任**を持つ。クラウドからの `cmd` は ESP/RP 経由で PLC へ反映する設計（Phase 121+ で Modbus 書込）。

---

## PLC イベントを MQTT へ上げる方法

### 方式 A: ESP/RP が PLC 状態をポーリング

1. RS485/Modbus で M/X/Y を読取
2. 変化検知で `tisly/.../PLC-FACTORY-001/state` を publish
3. 立上りで `.../event`（`event_type`: perimeter / intrusion / estop）

### 方式 B: Node-RED が Modbus ノードで読取

1. `modbus-read` で D/M 相当を取得
2. function ノードで統一イベント生成
3. HTTP ingest（`docs/node_red_http_ingest.md`）

### 方式 C: PLC 専用ゲートウェイ（将来）

GX Works サイドの通信ユニット → シリアル → ESP

---

## RS / Modbus 連携案

| 項目 | 案 |
|------|-----|
| 物理層 | RS485 2線、終端抵抗、GND 共通 |
| プロトコル | Modbus RTU（RP2350 RS485）または Modbus TCP（ESP Ethernet） |
| スレーブ ID | PLC 側ユニット = 1 |
| レジスタマップ | 下表「論理レジスタ」 |

---

## X / Y / M / D レジスタ設計案

論理アドレス（Modbus ホールディングレジスタ例）:

| アドレス | PLC 相当 | 内容 |
|----------|----------|------|
| 40001 | M0 | 警戒中 |
| 40002 | M1 | 外周警報保持 |
| 40003 | M2 | 近接警報保持 |
| 40004 | X1 | 非常停止（押下=1） |
| 40010 | Y0 | 赤ライト状態 |
| 40011–40014 | Y1–Y4 | 白ライト状態 |

**入力ミラー（DI）**: 40020–40027 ← X0–X7（拡張時）

ポーリング周期: **200ms**（制御は PLC 内、通信は監視のみ）

---

## 現場出力との対応

| 機能 | PLC 出力 | 備考 |
|------|----------|------|
| **非常停止** | X1 → 全 M/Y リセット | ハードウェア安全回路と併用 |
| **ライト** | Y0–Y4 | 100V は中継リレー必須 |
| **ブザー** | RP2350 RO4 または Y 拡張 | 警報時のみ |
| **パトライト** | RP2350 RO3 | 赤点滅連動可 |
| **heartbeat** | 通信デバイス側 | PLC RUN 中でも MQTT は ESP/RP が送信 |

ラダー参考: `ladder/TiSLY_HOME_Security_DEMO.txt`

---

## 統一イベント mapping

| PLC 状態 | event_type | severity |
|----------|------------|----------|
| M1 立上り | perimeter | alarm |
| M2 立上り | intrusion | alarm |
| X1 ON | estop | critical |
| M0 ON | armed | info |
| 復旧 | recovery | info |

---

## 検証チェック（実機到着後）

- [ ] シミュレータで X0→X2→X3→X1 順に動作
- [ ] MQTT `state` に M0/M1/M2 が一致
- [ ] `POST /api/devices/register` — `PLC-FACTORY-001`
- [ ] ingest → 通知 → Recovery タイムライン
