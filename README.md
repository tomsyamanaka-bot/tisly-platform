# TiSLY_HOME_Security_DEMO

TiSLY HOME Security のデモ展示用 PLC ラダープログラムです。  
三菱電機 **FX 系** PLC と **GX Works2 / GX Works3** を想定しています。

## TiSLY Notification Platform + Google TV（Phase 21–40）

通知は **ConoHa VPS / tisly.jp** に統一。スマホは **PWA**、**Google TV のみ**ネイティブアプリ。

| コンポーネント | パス |
|---------------|------|
| 通知コア | `server/notification/notification-service.ts` |
| tisly.jp API + 管理 UI | `server/` |
| PWA | `server/public/` |
| Google TV App | `tv-app/` |
| 設計ドキュメント | `docs/notification_architecture.md` 他 |

### 通知構成図

```
[ESP / RP2350 / PLC] → MQTT (VPS) → Node-RED
                          ↓
              notification-service.ts
                          ↓
            Web Push | Discord | Email
                          ↓
                 PWA (スマホ) / TV App
```

### Google TV 構成図

```
tv-app (Expo RN)
  Home ─┬─ Security / Events / Status
        ├─ Cameras (将来 RTSP/WebRTC)
        └─ Settings (キオスク)
              ↕ HTTPS
         tisly.jp /api/*
```

起動: `cd server && npm install && npm run dev` → http://localhost:3080/

---

## プロジェクト構成

```
TiSLY_HOME_Security_DEMO/
├── README.md
├── server/          … 通知プラットフォーム + PWA
├── tv-app/          … Google TV ネイティブ
├── docs/            … notification_architecture.md 等
├── rp2350/          … RP2350 Edition
└── ladder/
    ├── TiSLY_HOME_Security_DEMO.txt         … 命令語リスト (IL) + 段コメント
    └── TiSLY_HOME_Security_DEMO_LADDER.txt  … ラダー図テキスト参考
```

## I/O 割り当て表

### 入力 (X)

| デバイス | 名称 | 用途 | 備考 |
|---------|------|------|------|
| X0 | セレクタスイッチ | 警戒 ON/OFF | ON = 警戒開始 |
| X1 | 非常停止ボタン | 全停止 | ON = 停止要求 (押下) |
| X2 | ビームセンサー 1 | 外周検知 | 警戒中に検知 → 外周警報 |
| X3 | ビームセンサー 2 | 近接検知 | 警戒中に検知 → 近接警報 |

### 出力 (Y)

| デバイス | 名称 | 電源 | 動作 |
|---------|------|------|------|
| Y0 | 赤ライト | 24V | 警戒中: 低速点滅 / 近接警報: 高速点滅 |
| Y1 | 白ライト 1 | 100V | 外周警報: 常時点灯 |
| Y2 | 白ライト 2 | 100V | 外周警報: 1 秒点滅 |
| Y3 | 白ライト 3 | 100V | 近接警報: 常時点灯 |
| Y4 | 白ライト 4 | 100V | 近接警報: 常時点灯 |

### 内部リレー (M)

| デバイス | 名称 | 説明 |
|---------|------|------|
| M0 | 警戒中 | セレクタ ON で SET、OFF/非常停止で RST |
| M1 | センサー1 警報保持 | 外周検知ラッチ |
| M2 | センサー2 警報保持 | 近接検知ラッチ |
| M10 | 低速点滅用 | テンプレート拡張用 (予約) |
| M11 | 高速点滅用 | テンプレート拡張用 (予約) |
| M20 | Y0 制御 | 赤ライト出力前段 (二重コイル回避) |

### 特殊補助リレー

| デバイス | 周期 | 用途 |
|---------|------|------|
| M8013 | 1 秒 (0.5s ON/OFF) | 警戒時 Y0 低速点滅、Y2 点滅 |
| M8012 | 0.1 秒 (0.05s ON/OFF) | 近接警報時 Y0 高速点滅 |

---

## 動作説明

### 基本フロー

1. **警戒開始** … X0 (セレクタ) を ON → M0 (警戒中) が SET される。
2. **警戒中** … Y0 (赤ライト) が M8013 により **1 秒周期** でゆっくり点滅する。
3. **外周検知** … 警戒中に X2 が ON → M1 が SET (保持)。Y1 常灯、Y2 が 1 秒点滅。
4. **近接検知** … 警戒中に X3 が ON → M2 が SET (保持)。Y3・Y4 常灯、Y0 は **高速点滅** に切り替わる。
5. **警報解除** … X0 を OFF、または X1 (非常停止) を ON → M0/M1/M2 リセット、全出力 OFF。

### 状態別の出力イメージ

| 状態 | Y0 赤 | Y1 | Y2 | Y3 | Y4 |
|------|-------|----|----|----|-----|
| 停止 (X0 OFF) | OFF | OFF | OFF | OFF | OFF |
| 警戒中 (M0) | 1s 点滅 | OFF | OFF | OFF | OFF |
| 外周警報 (M1) | 1s 点滅* | ON | 1s 点滅 | OFF | OFF |
| 近接警報 (M2) | **0.1s 点滅** | ※ | ※ | ON | ON |
| 非常停止 (X1) | OFF | OFF | OFF | OFF | OFF |

\* M2 が ON の場合、Y0 は近接警報の高速点滅が最優先。  
※ M1 と M2 は独立保持のため、両方 ON の場合は各出力条件が OR 的に重なる。

### Y0 優先度

```
非常停止 (X1)  >  近接警報 M2 (高速)  >  警戒中 M0 (低速)  >  OFF
```

Y0 は内部リレー **M20** を経由して **単一コイル** で出力します。二重コイルは使用していません。

---

## 各シーンの動き (デモ説明用)

### 1. 警戒中

- オペレータがセレクタ (X0) を ON。
- 赤ライト (Y0) が **約 1 秒周期** で点滅 → 「監視中」が一目で分かる。
- 白ライト 4 回路はすべて OFF。

### 2. 外周検知 (ビームセンサー 1)

- 警戒中に X2 が遮断 → M1 がラッチ。
- Y1 (白 1) **常時点灯** … 外周で異常。
- Y2 (白 2) **1 秒点滅** … 注意喚起。
- Y0 は引き続き低速点滅 (M2 が OFF の場合)。

### 3. 近接検知 (ビームセンサー 2)

- 警戒中に X3 が遮断 → M2 がラッチ。
- Y3・Y4 (白 3・4) **常時点灯** … 侵入レベル。
- Y0 が **0.1 秒周期の高速点滅** に切り替わる → 最も危険な状態を強調。
- M0 による低速点滅より **M2 高速点滅が優先**。

### 4. 非常停止

- X1 を ON (ボタン押下)。
- M0 / M1 / M2 を即リセット。
- Y0～Y4 をすべて OFF → 安全側へ。

---

## 配線メモ

### 入力側

| 信号 | 推奨配線 | 注意 |
|------|---------|------|
| X0 セレクタ | 24V DC セレクタスイッチ → COM | ノーマル ON 運用 |
| X1 非常停止 | **b 接点 (NC)** 推奨 → 断線時も安全側 | 本プログラムは X1=ON で停止 |
| X2, X3 ビーム | センサー出力 (NPN/PNP) に合わせて COM 配線 | 遮光 = ON を想定 |

- 入力は FX ユニットの **漏電流・応答時間** に合わせてフィルタ (X0: 10ms 等) を GX Works で設定可能。
- 非常停止回路は **ハードウェア安全回路** (リレーインターロック等) と併用することを推奨。

### 出力側

| 出力 | 負荷 | 配線 |
|------|------|------|
| Y0 | 24V 赤ライト | トランジスタ/リレー出力 → 24V 電源 |
| Y1～Y4 | 100V 白ライト | **中継リレー必須** (PLC 直接 100V 不可) |

- 100V 白ライトは **外部リレーまたはコンタクタ** 経由で駆動する。
- 各リレーコイルに **フライバックダイオード** を付ける。
- 出力点数: Y0～Y4 = 5 点必要 (FX3U-16MR 以上などを選定)。

### 電源

- PLC: 100/200V AC または 24V DC (機種による)
- 入力回路: 24V DC
- Y0 負荷: 24V DC
- Y1～Y4 負荷: 100V AC (リレー経由)

---

## GX Works への取り込み手順

1. 新規プロジェクト作成 (例: `TiSLY_HOME_Security_DEMO`)
2. PLC 機種を FX3U / FX5U 等に設定
3. `ladder/TiSLY_HOME_Security_DEMO.txt` を参考にラダーを入力  
   - または IL リスト表示で命令語を貼り付け
4. 各 RUNG に `TiSLY_HOME_Security_DEMO_LADDER.txt` の段コメントを設定
5. シミュレータまたは実機で X0→X2→X3→X1 の順に動作確認

---

## 今後の連携前提 (ESP / Node-RED / TiSLY UI)

本 DEMO はスタンドアロン PLC ロジックですが、TiSLY 標準テンプレート化を見据えて以下を想定しています。

| レイヤ | 役割 | 連携案 |
|--------|------|--------|
| PLC (本プログラム) | リアルタイム制御・安全 | 最終出力とラッチ状態 |
| ESP32 等 | I/O 拡張・MQTT ゲートウェイ | X/Y のミラー、Modbus RTU/TCP |
| Node-RED | イベント連携・ログ | `armed` / `perimeter` / `intrusion` / `estop` トピック |
| TiSLY UI | ダッシュボード | 状態表示、履歴、リモート警戒 (将来) |

### 推奨 MQTT / 状態トピック (案)

```
tishly/home/security/state/armed      ← M0
tishly/home/security/state/perimeter  ← M1
tishly/home/security/state/intrusion  ← M2
tishly/home/security/state/estop      ← X1
tishly/home/security/event/alarm      ← 立上りイベント
```

### テンプレート化メモ

- 段 1～10 のコメント構造を TiSLY 標準ラダーテンプレートの見出しとして流用可能。
- M10 / M11 は Node-RED 側の点滅同期や UI アニメーション用に拡張予約。
- デバイス番号 (X0～X3, Y0～Y4) は `IO_ASSIGNMENT` マスタと共通化する。

---

## ライセンス / 注意

- デモ・評価用途のサンプルプログラムです。
- 実際のセキュリティ設備に適用する場合は、関連法規・安全規格に従い、ハードウェア安全回路を必ず設計してください。

---

**プロジェクト名:** TiSLY_HOME_Security_DEMO  
**バージョン:** 1.0.0  
**更新日:** 2026-05-28
