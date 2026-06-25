# TiSLY Master Vision — 絶対的思想書

**TiSLY（TOMS IoT Security Layer）** は、単一の PWA ではなく、電気工事会社の業務全体を内包する **プラットフォーム / OS** です。  
株式会社 TOMS が開発し、部品化・共通化されたライブラリを組み合わせて拡張していきます。

---

## 1. コンセプト — 電気工事会社の OS

| 思想 | 説明 |
|------|------|
| **一社完結** | 他社 SaaS に依存しない PWA 中心アーキテクチャ |
| **現場ファースト** | iPhone Safari / PWA で 60 歳でも迷わない UI |
| **写真中心** | 文字より写真・カードで業務を伝える |
| **データの正** | ローカル保存が正、QNAP はバックアップ母艦 |
| **部品化** | 現調・見積・IoT・ナレッジを独立モジュールとして共通化 |

最終ゴール: **現調 → 見積 → 施工 → 請求 → 保守 → IoT 監視 → AI ナレッジ** を一つの OS 上で完結させ、海外展開可能なプラットフォームにする。

---

## 2. Phase ロードマップ（Phase 1〜6）

### Phase 1 — 実務 PWA 基盤（完成済み）

- 日程調整 v1（Google Calendar 連携）
- 現調 v1（写真・部材・仕様書 PDF）
- 見積・請求 v1（顧客別単価ルール）
- 持ち物・発注・現場チェックリスト
- 到着・作業完了・完了報告書 PDF
- 案件センター・ダッシュボード

### Phase 2 — 書類・ストレージ・お客様 UI（完成済み）

- Document Viewer UX（モバイルカード UI）
- 案件 PDF ローカル保存 + QNAP WebDAV バックアップ
- `/app`（社内）と `/customer`（お客様）の完全分離
- Customer Master 連動のお客様ポータル

### Phase 3 — ナレッジ・MotherShip（完成済み基盤）

- Knowledge Acquisition / Automation / Search
- QNAP TS-464 を AI 知識庫・案件保管庫（MotherShip）として運用
- 現場ナレッジ（`/knowledge-field-v1`）— 3 秒で検索開始
- Embedding / RAG / LLM は次フェーズ（意図的に未実装）

### Phase 4 — 監視・3D・IoT 統合（進行中）

- TiSLY Monitoring 3D Dashboard（V1〜V3.4）
- LiDAR / GLB / mapAsset 管理
- RP2350 遠隔操作デモ（`/remote-test`）
- MQTT · ESP32 · PLC テンプレ統合
- 工場ライン・防犯の統合監視センター UI

### Phase 5 — AI 業務実行（次フェーズ）

- **文章生成ではなく業務実行** — AI は見積候補・チェック・不足検出を「実行」する
- AI 見積エンジン v2（現調図面 → 見積候補）基盤完成
- 将来: QNAP 側で推論・Embedding・RAG を集約

### Phase 6 — 海外展開・プラットフォーム化

- 多言語（i18n 戦略ドキュメント準備済み）
- テナント分離・顧客別ブランディング（PRO Remote 基盤）
- React Native 流用の shared モジュール（`server/src/shared/`）
- 各国の電気工事規格・帳票テンプレの差し替え可能設計

---

## 3. UI 思想 — 60 歳でも迷わないカード UI

| 原則 | 実装 |
|------|------|
| 大きいボタン | 44px 以上タップ領域 · safe-area 対応 |
| 写真優先 | 仕様書・完了報告・お客様 UI は写真 1 列 100% |
| カード UI | 白〜薄グレー背景 · 1 画面 1 目的 |
| 下部ナビ | 実務 PWA は 7〜8 タブ固定（日程/現調/見積/請求/案件/現場/材料/発注） |
| 戻るは 1 階層 | `history.back` 禁止 · ナビスタックで 1 画面ずつ戻る |
| お客様 UI | 技術語・QNAP・API URL を完全非表示 |

社内: `https://tisly.jp/app`  
お客様: `https://tisly.jp/customer`（PWA `start_url` も customer）

---

## 4. AI 思想 — 文章生成ではなく業務実行

| やること | やらないこと（現フェーズ） |
|----------|---------------------------|
| 見積候補の自動抽出（図面・テンプレ） | チャットボット的な文章生成 |
| PDF ルールベース解析 → ナレッジ候補 | Embedding / Qdrant / RAG |
| 写真 OCR 準備（rule_based_v1） | クラウド LLM への業務データ直送 |
| 案件完了時の Knowledge 自動候補 | AI による自動承認（人間承認必須） |
| 将来: QNAP 上で推論・学習 | PWA 上での AI 推論 |

AI の正しい役割: **現場の手を減らし、見積・チェック・保管を自動実行する**。

---

## 5. IoT 思想 — LAN・24V 中心

| 層 | 技術 | 役割 |
|----|------|------|
| エッジ | RP2350 · ESP32 | DI/DO · MQTT · 24V リレー制御 |
| PLC | 三菱 FX / テンプレビルダー | ラダー · Modbus · 工場ライン |
| ブローカー | Mosquitto（VPS 内部） | 統一トピック `tisly/{tenant}/{site}/{device}/...` |
| ゲートウェイ | Node-RED → HTTP ingest | イベント正規化 |
| 表示 | PWA Push · Monitoring 3D · Google TV | 人間への通知・俯瞰 |

**LAN 中心**: 現場 LAN + 24V 配線が前提。クラウド依存のリアルタイム制御はしない。  
**正はデバイス側**: RP2350 の `chStates` が正。VPS/PWA は heartbeat で同期。

---

## 6. QNAP 思想 — データ倉庫（MotherShip）

| 役割 | 説明 |
|------|------|
| **本番サーバーではない** | ConoHa VPS がアプリ本体 |
| **バックアップ母艦** | 案件 PDF · 写真 · ナレッジカード · リポジトリミラー |
| **AI 知識庫の土台** | `AI/` · `KnowledgeCards/` · `SearchIndex/` |
| **接続** | WebDAV（`/storage-settings-v1`）· SMB 並行 |

保存の優先順位:

1. **正**: `uploads/business/{projectId}/pdfs/`（VPS ローカル）
2. **バックアップ**: QNAP `/TiSLY/projects/{id}/estimate|invoice|specification|completion-report/`
3. **Mock**: 未設定時は `uploads/qnap-storage-mock/` へミラー（UI に明示）

---

## 7. 写真管理の絶対ルール

| 種類 | テーブル | 載せる PDF |
|------|---------|-----------|
| 現調写真 | `survey_photos` | 仕様書のみ |
| 完了報告写真 | `completion_photos` | 完了報告書のみ |
| 見積・請求 | — | 写真なし |

**混在禁止** — このルールを破ると現場・お客様・帳票すべてが壊れる。

---

## 8. 海外展開

- テナント分離（`customerCode`）· プラン制限 · サブドメイン設計済み
- 帳票テンプレ（`server/src/business/pdf/`）は差し替え可能
- i18n: 施工 PWA に ja/en 基盤 · 本格展開は Phase 6
- 規格: 各国の電気工事基準は Knowledge + マスターで管理

---

## 9. 開発者が守ること

1. 変更前に [`docs/autonomous/PROJECT_STATUS.md`](autonomous/PROJECT_STATUS.md) を読む
2. 写真種別を混ぜない
3. PDF 共有は `files` のみ（URL/title/text 禁止 — LINE 混入防止）
4. `history.back` を使わない
5. お客様 UI に技術語を出さない
6. 本番反映は `master` push → VPS 自動デプロイ（手動不要）

---

## 10. 関連ドキュメント

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — システム構造
- [`tisly_core_policy.md`](tisly_core_policy.md) — PWA・通知方針
- [`mothership.md`](mothership.md) — QNAP 運用
- [`autonomous/PROJECT_STATUS.md`](autonomous/PROJECT_STATUS.md) — 完成仕様
