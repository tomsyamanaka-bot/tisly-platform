# QNAP Document Center / Qsirch — TiSLY Knowledge 連携案

**最終更新:** 2026-06-21  
**種別:** 調査メモ（実装不要）

TiSLY Knowledge Core v1 のローカル構造を、QNAP TS-464（TiSLYNAS）上の AI 検索基盤とどう接続するかの草案。

---

## QNAP 関連製品概要（2025–2026）

### Qsirch

QNAP NAS 専用の AI 検索エンジン（App Center）。

| 機能 | 概要 |
|------|------|
| キーワード検索 | 従来型ファイル名・メタデータ検索 |
| AI セマンティック検索 | 自然言語での画像/文書検索（23 言語） |
| AI OCR | 画像内テキスト認識 · `.txt` エクスポート |
| RAG Search（Beta / v5.6+） | LLM + 検索結果で contextual 回答 |
| Workspace（v7.0+） | embedding による知識ドメイン · 要約 · 比較分析 |

**要件（セマンティック/RAG）:**

- Qsirch 5.4+ / 7.0+（Workspace）
- QNAP AI Core 3.6+
- 64bit x86 NAS · QTS 5.0.1+ · RAM 8GB 推奨
- TS-464 は x86 なので **要件を満たす想定**

参考: [Qsirch 公式](https://www.qnap.com/en/software/qsirch) · [QNAP Blog — AI Knowledge Brain](https://blog.qnap.com/en/more-than-search-your-ai-knowledge-brain/)

### Document Center（旧称含む統合文書管理）

QNAP エコシステムでは **Qsirch が Document Center 的な検索・閲覧の中核** になっている。  
QuMagie（写真）· Multimedia Console · File Station と併用。

TiSLY では **案件 PDF（WebDAV v1）** と **MotherShip SMB フォルダ** が並行。Knowledge 用は **AI/** 配下を Qsirch のインデックス対象にする。

---

## TiSLY 現状との位置づけ

| 系統 | パス | 検索 |
|------|------|------|
| WebDAV PDF v1 | `/TiSLY/projects/{id}/...` | TiSLY PWA のみ |
| MotherShip SMB | `/TiSLY/Projects/` · `Photos/` · `Documents/` | robocopy · 手動 |
| **TiSLY Knowledge v1** | `/TiSLY/AI/Standards/` 等 | TiSLY `keyword_v1` API |
| **Qsirch（将来）** | 上記 AI + Documents 全体 | RAG · OCR · セマンティック |

**方針:** TiSLY Knowledge Card = **メタデータの正**。実ファイルは AI 配下。Qsirch は **ファイル内容 + OCR** の検索層。

---

## 連携案 A — Qsirch Workspace（推奨・中長期）

```
TiSLY PWA (/knowledge-v1)
    ↓ POST card + files
server/data/knowledge/  →  sync worker  →  \\TiSLY\AI\
    ↓                                           ↓
SearchIndex/index.json                    Qsirch Workspace
    ↓                                      「TiSLY-工事ナレッジ」
GET /api/knowledge/search?q=              RAG / セマンティック
    ↓ (v3+)                                 ↓
keyword_v1 → Qsirch API proxy（将来）    LLM 回答 + 引用 PDF
```

**手順（人間作業）:**

1. QNAP App Center → Qsirch 7.0+ · QNAP AI Core 更新
2. Qsirch → RAG Search 有効 · embedding モデル設定
3. Workspace 作成: 名前 `TiSLY-Knowledge` · 対象 `\\TiSLY\AI\`
4. サブフォルダ単位で Workspace を分ける案:
   - `TiSLY-Standards` → `AI/Standards/`
   - `TiSLY-Ladder` → `AI/Ladder/` + `PLC/`
   - `TiSLY-Troubles` → `AI/Troubles/`

**TiSLY 側:**

- Knowledge Card の `files[]` が Qsirch インデックス済みパスと一致するよう維持
- 検索 API v3 で Qsirch REST（または NAS 上スクリプト）をプロキシ

---

## 連携案 B — OCR パイプライン（PDF/現場写真）

| 入力 | Qsirch 処理 | TiSLY 連携 |
|------|-------------|------------|
| 仕様書 PDF | 全文 OCR · テキスト抽出 | Document Center API → Card `summary` 下書き |
| 取説 PDF | AI OCR | `AI/Materials/` へ配置後インデックス |
| 現調写真 | セマンティック画像検索 | **survey のみ** · completion と混在禁止 |

**注意:** 写真 OCR はプライバシー・顧客名マスキングポリシーが必要。

---

## 連携案 C — 二層検索（短期実装向け）

1. **Layer 1（TiSLY v1）:** Knowledge Card メタデータ · 高速 · オフライン可
2. **Layer 2（Qsirch）:** ファイル全文 · RAG · 管理者向け

PWA UX:

```
現場 → Layer 1 で即ヒット
     → 「詳細を NAS で検索」→ Layer 2（QNAP 管理画面 or 将来 iframe/API）
```

---

## API 拡張案（将来）

```typescript
// server/src/knowledge/knowledge-search-v2.ts（未実装）
interface KnowledgeSearchProvider {
  search(query: string): Promise<KnowledgeSearchHit[]>;
}
class KeywordSearchProviderV1 implements KnowledgeSearchProvider { ... }
class QsirchRagProvider implements KnowledgeSearchProvider { ... }
```

環境変数案:

| 変数 | 用途 |
|------|------|
| `QNAP_QSIRCH_ENABLED` | Qsirch プロキシ ON/OFF |
| `QNAP_QSIRCH_BASE_URL` | NAS 上 Qsirch API |
| `QNAP_QSIRCH_WORKSPACE_ID` | デフォルト Workspace |

---

## TS-464 向け運用メモ

| 項目 | 推奨 |
|------|------|
| RAM | 8GB 以上（Qsirch RAG） |
| インデックス対象 | 最初は `AI/` のみ（案件 PDF は別系統のまま） |
| バックアップ | 既存 `backup-qnap.ps1` で repo-mirror · AI フォルダは SMB 上で別途スナップショット |
| セキュリティ | RAG にクラウド LLM を使う場合は **顧客名・住所のマスキング** を Workspace ルールで除外 |

---

## 未調査 · 要確認

- [ ] Qsirch REST API の TS-464 / QTS バージョン別エンドポイント
- [ ] Workspace 自動作成の CLI / qpkg 設定
- [ ] WebDAV 経由ファイルが Qsirch インデックス対象か（SMB 推奨の可能性）
- [ ] TiSLY VPS から NAS 内 Qsirch への VPN / ポートフォワード要件

---

## 関連

- [knowledge.md](./knowledge.md)
- [knowledge-roadmap.md](./knowledge-roadmap.md)
- [mothership.md](./mothership.md)
