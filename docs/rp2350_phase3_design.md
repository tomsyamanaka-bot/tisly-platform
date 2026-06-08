# RP2350 Phase 3 — 次フェーズ設計（CH2〜CH8 実装中）

**前提:** Phase 2 PoC 完了（2026-06-08 実機確認済み）

**本ドキュメントの範囲:** 優先順位付きの設計方針。**CH2〜CH8 拡張は実装着手済み**（ファームウェア `1.2.0-ch8`）。MQTT 本格移行・QNAP 連携・認証作り込み・UI 大改造は **含まない**。

---

## 優先順位一覧

| 順位 | 項目 | 目的 | 依存 |
|------|------|------|------|
| 1 | CH2〜CH8 拡張 | 8RO 全チャンネルの遠隔制御 | Phase 2 HTTP API |
| 2 | 8DI 入力読み取り | センサー状態の VPS 反映 | GPIO ピン確定 |
| 3 | offline アラート | デバイス断線を PWA Push で通知 | heartbeat / lastSeen |
| 4 | MQTT 移行案 | HTTP poll からイベント駆動へ | ブローカー常駐 |
| 5 | 量産ファーム方針 | 出荷・検査・OTA の標準化 | 1〜3 安定後 |

---

## 1. CH2〜CH8 拡張 — **実装中**

### 実装済み（2026-06-08）

| 層 | ファイル | 内容 |
|----|----------|------|
| VPS API | `server/src/api/routes/remote-test.ts` | `POST /ch{N}/on\|off`（N=1..8） |
| 状態 | `server/src/remote-test/remote-test-state.ts` | `chStates`（全 CH 保持）· `ch1State` 互換 |
| PWA | `server/public/remote-test.html` · `js/remote-test.js` | CH1〜8 ボタン・バッジ |
| ファーム | `rp2350/firmware/main.py` · `config.py` | `CH_GPIO` 17〜24 · `exec_command()` 一般化 |
| GPIO | `rp2350/config/gpio_map.json` | RO1〜RO8 = GPIO17〜24 |

### 設計方針（変更なし）

**API（VPS）**

```
POST /api/remote-test/ch{N}/on
POST /api/remote-test/ch{N}/off    # N = 1..8
GET  /api/remote-test/command      # 返却: { command: "ch3_on" | "ch5_off" | null }
```

- コマンドキューは 1 件 pending（現行と同じ）。複数 CH 同時操作は順次 poll で配信
- 状態オブジェクト: `chStates: Record<1..8, "on"|"off">`
- PWA: 8 ボタン行を追加（CH1 と同 UI パターン）。大改造は避け、縦リストで十分

**ファームウェア（RP2350）**

```python
# config.py — Waveshare 02_MQTT サンプル準拠（RO1=17 は実機確認済み）
CH_GPIO = {1: 17, 2: 18, 3: 19, 4: 20, 5: 21, 6: 22, 7: 23, 8: 24}
```

- `exec_command()` を `ch{N}_on|off` パターンに一般化
- `relay_manager.py`（既存モジュール）を段階的に `main.py` へ統合

**GPIO 確定手順（実装前タスク）**

1. Waveshare Wiki `01_GPIO` とシルク表示を照合
2. `rp2350/config/gpio_map.json` の `gpio_pin` を埋める
3. 各 RO を 1 点ずつ ON/OFF して実測確認

**完了条件**

- PWA から CH1〜CH8 それぞれ 3 秒以内に反応
- VPS status API に全 CH 状態が含まれる

---

## 2. 8DI 入力読み取り

### 現状

- `gpio_map.json` に DI1〜DI8 の論理名は定義済み、`gpio_pin` は未確定
- `input_manager.py` / `tisly_logic.py` にデバウンス・安全ロジックの雛形あり
- HTTP 経路では DI 未送信

### 設計方針

**Phase 3a（HTTP 経路・PoC 延長）**

```
GET /api/remote-test/di          # RP2350 が poll 時に POST でも可
POST /api/remote-test/di         # body: { di: { "1": 0, "2": 1, ... } }
```

- RP2350: poll ループ内で DI を読み、変化時のみ POST（帯域節約）
- デバウンス: `gpio_map.json` の `debounce_ms`（30〜50ms）を `input_manager` で適用
- VPS: `diStates` を state に保持、PWA に 8 点の ON/OFF 表示（読み取り専用）

**Phase 3b（ローカル安全）**

- DI7（非常停止）検知時は **ローカルで全 RO OFF**（VPS 到達を待たない）
- `safety_manager.py` の既存ロジックを優先適用

**DI ピン確定**

| DI | 論理名 | 用途 |
|----|--------|------|
| DI1 | ir_beam_1 | 赤外線ビーム① |
| DI2 | ir_beam_2 | 赤外線ビーム② |
| DI3 | pir_1 | 人感① |
| DI4 | pir_2 | 人感② |
| DI5 | window_1 | 窓マグネット① |
| DI6 | window_2 | 窓マグネット② |
| DI7 | emergency | 非常停止 |
| DI8 | spare_di | 予備 |

**完了条件**

- センサー操作で PWA の DI 表示が 3 秒以内に更新（変化時 POST + poll 併用）
- 非常停止で全 RO がローカル即時 OFF

---

## 3. offline アラート

### 現状

- `DEVICE_OFFLINE_THRESHOLD_SEC = 90`（`remote-test-state.ts`）
- PWA は status ポーリングで online/offline 表示
- **断線時の Push 通知は未実装**

### 設計方針

**サーバー側（推奨）**

```typescript
// 擬似コード — 実装は Phase 3 で行う
setInterval(() => {
  const wasOnline = prevOnline;
  const nowOnline = getDeviceStatus().online;
  if (wasOnline && !nowOnline) {
    sendWebPush({ title: "RP2350 offline", body: "90秒以上応答なし" }, REMOTE_TEST_USER_ID);
  }
  prevOnline = nowOnline;
}, 30_000);
```

- 判定: `lastSeen` から 90 秒超 → offline（現行ロジックをそのまま利用）
- **online → offline の遷移時のみ** 1 回 Push（スパム防止）
- offline → online 復帰時も任意で「復帰通知」（設定フラグで ON/OFF）
- ログ: `remote-test-state` の logs に `device_offline` / `device_online` を記録

**PWA 側（最小）**

- 既存の Push 登録を流用（新規 UI 不要）
- offline バッジの色変更（黄 → 赤）は既存 CSS のみ

**完了条件**

- LAN 切断 90 秒後に iPhone PWA へ Push が 1 回届く
- 復帰後 online 表示が 60 秒以内に更新

---

## 4. MQTT 移行案（本格移行は Phase 4 以降）

### 現状

- PoC は **HTTP poll**（RP2350 → VPS）。シンプルでファイアウォール越しに安定
- `rp2350/mqtt/README.md` にトピック設計済み
- VPS 内部 Mosquitto は既存 server 基盤に mock/real 切替あり

### 移行方針（段階的）

```
Phase 2 (現在)   RP2350 ──HTTP poll──► VPS (/api/remote-test/*)
Phase 3        RP2350 ──HTTP + DI──► VPS（機能拡張・MQTT 併用なし）
Phase 4a       RP2350 ──MQTT publish──► VPS Mosquitto ──► Node-RED / server ingest
Phase 4b       双方向 cmd/heartbeat を MQTT に一本化、HTTP はフォールバック
```

**トピック（既存設計を踏襲）**

```
tisly/home/di/{1..8}       # retain なし、変化時 publish
tisly/home/relay/{1..8}    # retain あり
tisly/home/heartbeat       # 60 秒
tisly/home/cmd/{ch_on|ch_off}  # VPS → 機器
tisly/home/event           # DI 変化・alarm
```

**RP2350 側**

- `ethernet_mqtt.py` / `mqtt_client.py` を `main.py` から切替可能に（`config.TRANSPORT = "http" | "mqtt"`）
- MicroPython の MQTT はメモリ制約あり → heartbeat 60 秒は維持

**VPS 側**

- 既存 `server/src/mqtt/mqtt-subscriber.ts` に remote-test 用ハンドラを追加
- `MQTT_MODE=real` 時のみ有効。mock 時は HTTP のみ（開発継続）

**移行しないもの（明示）**

- QNAP 連携
- AI 分析パイプライン
- 顧客マルチテナント MQTT ACL（別フェーズ）

---

## 5. 量産ファーム方針

### 目標

出荷前に **同一手順** で書き込み・検査・ラベル貼付ができる状態にする。

### ディレクトリ構成（既存を拡張）

```
rp2350/
├── firmware/
│   ├── main.py          # 量産版エントリ
│   ├── config.py        # 現場では書き換えない（下記 config_store 経由）
│   └── config_store.py  # デバイス固有値（JSON on flash）
├── manufacturing/
│   ├── inspection_checklist.md  # 更新
│   └── bom.csv
├── release/
│   └── v1.2.0/          # タグ付きリリース
└── config/
    └── gpio_map.json    # 確定版を release に同梱
```

### デバイス固有設定（現場で変えるもの）

| 項目 | 保存先 | 設定方法 |
|------|--------|----------|
| `DEVICE_ID` | `config_store.json` | 出荷時 QR / ラベルスキャン |
| `REMOTE_TEST_TOKEN` → 本番は `DEVICE_SECRET` | 同上 | VPS プロビジョニング API |
| `API_BASE` / MQTT broker | 同上 | 顧客サイトごとテンプレ |
| GPIO マップ | ビルド時固定 | ハードウェアリビジョンごと |

### 出荷検査フロー（`inspection_checklist.md` 拡張案）

1. USB 書き込み → `TISLY BOOT` ログ
2. Ethernet Link / DHCP IP 取得
3. VPS heartbeat 1 回成功
4. CH1 ON/OFF 実機確認
5. DI 未接続時の論理レベル確認
6. 非常停止（DI7）で全 RO OFF
7. ラベル貼付・`DEVICE_ID` 台帳登録

### バージョン管理

- セマンティック: `MAJOR.MINOR.PATCH`（例: `1.2.0-ch8-di`）
- `config.FIRMWARE_VERSION` と VPS `firmware` クエリで一致確認
- Git タグ `rp2350-v1.2.0` + `release/v1.2.0/RELEASE_NOTES.md`

### OTA（将来・設計のみ）

- Phase 3 では **USB 書き込みのみ**（Thonny / mpremote）
- Phase 5 以降: HTTPS で `.mpy` 差分 or 全量 `main.py` 配信（署名検証必須）

---

## 実装しないもの（本フェーズ）

| 項目 | 理由 |
|------|------|
| MQTT 本格移行 | HTTP PoC 安定後に Phase 4 で実施 |
| QNAP 連携 | 顧客案件フロー完成後 |
| AI 分析 | 入力データ蓄積後 |
| 認証作り込み | Remote Test はトークン認証で十分（PoC 期間） |
| UI 大改造 | CH ボタン追加程度に留める |

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `rp2350/firmware/main.py` | 現行 PoC ファーム |
| `rp2350/firmware/config.py` | poll 3s / heartbeat 60s |
| `rp2350/config/gpio_map.json` | DI/RO ピン（要確定） |
| `server/src/remote-test/remote-test-state.ts` | offline 90s 判定 |
| `server/src/api/routes/remote-test.ts` | HTTP API |
| `docs/remote-test-phase2-deploy.md` | VPS デプロイ手順 |
| `rp2350/mqtt/README.md` | MQTT トピック設計 |
