# TiSLY Lite RC1 — システム構成図

**対象:** TiSLY Lite RC1 Freeze（`1.4.0-remote-test-phase6`）  
**更新日:** 2026-06-08

---

## 1. 全体構成

```mermaid
flowchart TB
    subgraph Client["クライアント層"]
        IPHONE["iPhone Safari PWA<br/>https://tisly.jp/remote-test"]
        SW["Service Worker<br/>scope: /remote-test/"]
    end

    subgraph Cloud["ConoHa VPS — tisly.jp"]
        NGINX["nginx<br/>TLS 終端"]
        API["Express API<br/>/api/remote-test/*"]
        RT_STATE["remote-test-state<br/>chStates · inputStates · 命令キュー"]
        SEC_MODE["Security Demo<br/>ARM/DISARM · eventHistory"]
        PUSH["Web Push<br/>VAPID + web-push"]
        DB["SQLite<br/>notification_logs"]
        CFG["security-demo.json"]
        PERSIST["remote-test-security-demo.json"]
    end

    subgraph Field["現場 — デモ機"]
        RP["RP2350-POE-ETH-8DI-8RO<br/>MicroPython main.py"]
        ETH["W5500 Ethernet<br/>DHCP / PoE"]
        DI["DI1〜DI8<br/>GPIO9〜16"]
        RO["RO1〜RO8<br/>GPIO17〜24"]
    end

    IPHONE --> NGINX --> API
    IPHONE <--> SW
    PUSH -.->|RFC 8030| SW
    SW -.-> IPHONE

    API --> RT_STATE
    API --> SEC_MODE
    SEC_MODE --> PERSIST
    SEC_MODE --> CFG
    RT_STATE --> PUSH
    PUSH --> DB

    RP --> ETH
    ETH -->|"HTTPS poll 3s<br/>heartbeat 60s"| API
    API -->|"pendingCommand"| RP
    DI --> RP
    RP --> RO
```

---

## 2. 論理レイヤ

```mermaid
flowchart LR
    subgraph Presentation["プレゼンテーション"]
        PWA_UI["remote-test.html<br/>警戒 · DI · CH · 履歴"]
    end

    subgraph Application["アプリケーション"]
        ROUTES["remote-test.ts"]
        NOTIFY["remote-test-ch-notify.ts"]
        SEC["security-demo-handler"]
    end

    subgraph Domain["ドメイン状態"]
        CH_S["confirmedChStates"]
        IN_S["confirmedInputStates"]
        ARM["securityMode ARM|DISARM"]
        EVT["eventHistory"]
    end

    subgraph Device["デバイス"]
        FW["main.py<br/>poll_inputs · exec_command · heartbeat"]
    end

    PWA_UI --> ROUTES
    ROUTES --> CH_S & IN_S & ARM & EVT
    ROUTES --> NOTIFY
    FW --> ROUTES
```

---

## 3. データフロー — CH 遠隔操作

```mermaid
sequenceDiagram
    participant PWA as iPhone PWA
    participant VPS as tisly.jp API
    participant RP as RP2350

    PWA->>VPS: POST /ch{N}/on
    Note over VPS: pendingCommand = ch{N}_on

    loop 3秒ごと
        RP->>VPS: GET /command
        VPS-->>RP: ch{N}_on
    end

    RP->>RP: exec_command() · GPIO ON
    RP->>VPS: POST /heartbeat { chStates }
    VPS->>VPS: 差分検出
    VPS-->>PWA: Web Push「CH{N} ON」
    PWA->>VPS: GET /status（ポーリング）
```

---

## 4. データフロー — 警戒・侵入デモ

```mermaid
sequenceDiagram
    participant PWA as iPhone PWA
    participant VPS as VPS Security Demo
    participant RP as RP2350（任意）

    PWA->>VPS: POST /arm
    VPS->>VPS: securityMode=ARM 永続化
    VPS-->>PWA: Push「警戒ON」

    alt 侵入シミュレーション（配線不要）
        PWA->>VPS: POST /demo/intrusion-simulation
        VPS->>VPS: DI1 ON 疑似 · eventHistory
        VPS-->>PWA: Push「侵入検知 / 駐車場センサー」
    else 実機 DI1 接点 ON
        RP->>VPS: heartbeat { inputStates.1=on }
        VPS->>VPS: 差分 + ARM 中 → 通知
        VPS-->>PWA: Push「侵入検知 / 駐車場センサー」
    end

    PWA->>VPS: POST /disarm
    VPS-->>PWA: Push「警戒OFF」
    Note over VPS: 以降 DI 変化は eventHistory のみ
```

---

## 5. ネットワーク・ポート

| 経路 | プロトコル | ポート | 備考 |
|------|------------|--------|------|
| PWA ↔ VPS | HTTPS | 443 | nginx 経由 |
| RP2350 ↔ VPS | HTTPS | 443 | アウトバウンドのみ |
| RP2350 LAN | DHCP | — | W5500、PoE または DC 供給 |

**ファイアウォール:** RP2350 から `tisly.jp:443` への送信のみ必要（インバウンド不要）。

---

## 6. 認証・セキュリティ（RC1 スコープ）

```mermaid
flowchart LR
  PWA["PWA"] -->|"X-Remote-Test-Token"| API["/api/remote-test/*"]
  RP["RP2350"] -->|"同一トークン"| API
  API --> PUSH["Web Push VAPID"]
```

| 項目 | RC1 実装 | Phase 7 予定 |
|------|----------|--------------|
| API 認証 | 共有トークン | per-device JWT / mTLS |
| 通信 | TLS 1.2+ | 維持 |
| マルチテナント | なし | テナント分離 |

---

## 7. タイミング定数

| 項目 | 値 | 定義元 |
|------|-----|--------|
| 命令ポーリング | 3 秒 | `config.POLL_INTERVAL_SEC` |
| heartbeat | 60 秒 | `config.HEARTBEAT_INTERVAL_SEC` |
| offline 判定 | 90 秒 | `DEVICE_OFFLINE_THRESHOLD_SEC` |
| PWA ポーリング | 5 秒 | `remote-test.js` |
| eventHistory 上限 | 100 件 | サーバー |
| notificationHistory 上限 | 50 件 | サーバー |

---

## 8. ファイルマップ

| 役割 | リポジトリパス |
|------|----------------|
| ファームウェア | `rp2350/firmware/main.py` |
| デバイス設定 | `rp2350/firmware/config.py` |
| API ルート | `server/src/api/routes/remote-test.ts` |
| 状態管理 | `server/src/remote-test/remote-test-state.ts` |
| Push 通知 | `server/src/remote-test/remote-test-ch-notify.ts` |
| セキュリティデモ | `server/src/remote-test/security-demo*.ts` |
| PWA | `server/public/remote-test.html` |
| センサー定義 | `server/config/security-demo.json` |

---

## 9. 関連図

- 8DI 詳細: [phase6-8di-configuration.md](../phase6-8di-configuration.md)
- Security Demo 画面: [security-demo-mode.md](../security-demo-mode.md)
- 配線: [wiring-diagram.md](./wiring-diagram.md)
