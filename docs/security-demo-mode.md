# TiSLY Lite Security Demo Mode

**目的:** Remote Test PoC を営業デモ可能な「TiSLY Lite 防犯デモ機」として動作させる。

**対象 URL:** https://tisly.jp/remote-test  
**設定ファイル:** `server/config/security-demo.json`  
**状態永続化:** `server/data/remote-test-security-demo.json`（警戒モード・イベント履歴）

---

## 画面構成図

```mermaid
flowchart TB
    subgraph PWA["PWA /remote-test"]
        TOKEN["認証トークン"]
        PUSH["Push 登録・テスト"]
        SEC["システム状態<br/>ARM / DISARM"]
        ARM_BTN["警戒ON / 警戒OFF"]
        SIM["侵入シミュレーション"]
        DEV["RP2350 接続状態"]
        DI["DI1〜DI8 状態"]
        CH["CH1〜CH8 状態・操作"]
        EVT["イベント履歴<br/>最新20件"]
        NH["通知履歴<br/>Push送信分"]
        LOG["操作ログ"]
    end

    subgraph VPS["VPS server"]
        API["/api/remote-test/*"]
        MODE["securityMode ARM|DISARM"]
        EH["eventHistory 最大100件"]
        NH_SRV["notificationHistory 最大50件"]
        CFG["security-demo.json"]
    end

    subgraph HW["RP2350"]
        DI_HW["DI1〜8 センサー"]
        RO["RO1〜8 リレー"]
    end

    ARM_BTN --> API --> MODE
    SIM --> API
    DI_HW -->|heartbeat| API
    API --> EH
    API --> NH_SRV
    CFG --> API
    API -.->|Web Push| PWA
    EVT --> PWA
    NH --> PWA
```

---

## 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> DISARM : 起動 / 解除

    DISARM --> ARM : PWA「警戒ON」<br/>POST /arm
    ARM --> DISARM : PWA「警戒OFF」<br/>POST /disarm

    state ARM {
        [*] --> Monitoring
        Monitoring --> Alert : DI変化 ON/OFF
        Alert --> Monitoring : 状態安定
    }

    state DISARM {
        [*] --> Idle
        Idle --> LogOnly : DI変化
        LogOnly --> Idle
    }

    note right of ARM
        DI変化時:
        eventHistory 記録
        Push 通知
        notificationHistory 記録
    end note

    note right of DISARM
        DI変化時:
        eventHistory のみ（type=input）
        Push なし
    end note
```

---

## API 一覧（追加分）

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/remote-test/arm` | 警戒 ON（永続化・Push・履歴） |
| POST | `/api/remote-test/disarm` | 警戒 OFF（永続化・Push・履歴） |
| POST | `/api/remote-test/demo/intrusion-simulation` | DI1 ON を疑似発生（配線不要デモ） |
| GET | `/api/remote-test/status` | `securityMode` · `eventHistory` · `eventHistoryDisplay` を追加 |

---

## センサー設定（security-demo.json）

| DI | 用途 | イベント種別 | Push タイトル（ON） |
|----|------|-------------|---------------------|
| DI1 | 駐車場センサー | intrusion | 侵入検知 |
| DI2 | リビング窓 | window | 窓開放検知 |
| DI3 | 勝手口 | intrusion | 侵入検知 |
| DI4 | 非常ボタン | emergency | 非常ボタン押下 |
| DI5〜8 | 予備 | spare | センサー反応 |

名称・通知文は `server/config/security-demo.json` を編集して変更可能。

---

## 営業デモ手順（推奨）

1. iPhone で PWA をホーム画面に追加し Push 登録
2. **警戒ON** をタップ → Push「警戒ON」
3. **侵入シミュレーション** をタップ → Push「侵入検知 / 駐車場センサー」
4. 実機がある場合は DI1 接点を ON にして同様の通知を確認
5. **警戒OFF** をタップ → 以降のセンサー変化はイベント履歴のみ

---

## テスト

```bash
cd server && npx tsx --test test/remote-test.test.ts
```

| シナリオ | 期待結果 |
|----------|----------|
| ARM + DI1 ON | eventHistory + Push + notificationHistory |
| DISARM + DI1 ON | eventHistory のみ（Push なし） |
| POST /arm | securityMode=ARM がファイルに永続化 |
