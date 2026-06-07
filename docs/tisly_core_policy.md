# TiSLY Core Policy

TiSLY プラットフォームの正式方針。新機能・リファクタリングは本ドキュメントに従う。

## 基本方針

**TiSLY は最初から最後まで PWA 中心で構成する。**

目的: **他社サービスに依存しない**

- スマートフォン・タブレット → PWA（Web Push）
- Google TV → `tv-app/` ネイティブ（表示専用）
- 外部 SaaS への通知依存は標準機能としない

---

## 通知

### 優先順位

| 順位 | チャネル | 状態 |
|------|---------|------|
| 1 | **TiSLY PWA Push** | 標準・最優先 |
| 2 | SMS | 将来実装 |
| 3 | Email | 将来実装 |

### 標準機能にしない（optional 扱い）

以下は **標準機能に含めない**。既存コードは optional として残すが、新規開発の前提としない。

- Discord
- LINE
- Slack
- Chatwork

> Discord 通知は **廃止方向**。LINE 通知は **実装しない**。

---

## 認証

**TiSLY 独自認証** を前提設計とする。

- JWT ベース
- Role: **Admin** / **Manager** / **User**

### 実装しない

- Google Login
- Discord Login

---

## ログ

**全ログは TiSLY DB へ保存** する。

| 種別 | 説明 |
|------|------|
| イベント | センサー・警報トリガー |
| 警報 | アラート・エスカレーション |
| 操作履歴 | ユーザー・管理者操作 |
| 接続履歴 | デバイス・PWA 接続 |
| 障害履歴 | システム・デバイス障害 |

---

## AI

AI 分析は **将来 QNAP 側へ集約** する。

PWA の担当範囲:

- 表示
- 設定
- 通知
- 操作

AI 推論・画像解析は PWA では行わない。

---

## Remote Test

`remote-test` は段階的に完成させる。

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | 通知（Web Push） | 完成 |
| Phase 2 | CH1 ON/OFF | 完成 |
| Phase 3 | RP2350 状態取得 | 完成 |

---

## TiSLY App（PWA ダッシュボード）

4 画面構成:

| 画面 | パス |
|------|------|
| Home | `/tisly-app/home` |
| Devices | `/tisly-app/devices` |
| Events | `/tisly-app/events` |
| Settings | `/tisly-app/settings` |

---

## 関連ドキュメント

- [VAPID セットアップ](vapid_env_setup.md)
- [Web Push セットアップ](web_push_setup.md)
- [Remote Test Phase 2 デプロイ](remote-test-phase2-deploy.md)
- [通知アーキテクチャ](notification_architecture.md)
