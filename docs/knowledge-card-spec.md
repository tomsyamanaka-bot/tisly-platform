# Knowledge Card 仕様 v1

**最終更新:** 2026-06-21  
**ファイル名:** `knowledge-card.json`（保存時は `{id}.json`）

Knowledge Card は TiSLY Knowledge の **最小検索単位**。将来の AI 検索（RAG）で参照するメタデータの基礎となる。

---

## スキーマ

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `id` | string | ✅ | 一意 ID。例: `PLC-SELF-HOLD-001` |
| `title` | string | ✅ | 表示タイトル |
| `category` | string | ✅ | 工事カテゴリ（`master/work-categories.json`） |
| `tags` | string[] | ✅ | 検索用タグ（空配列可） |
| `summary` | string | ✅ | 概要（1〜3 文） |
| `files` | string[] | — | AI 配下相対パス。例: `Ladder/self-hold-example.pdf` |
| `updatedAt` | string | ✅ | 更新日 `YYYY-MM-DD` |

---

## 例

```json
{
  "id": "PLC-SELF-HOLD-001",
  "title": "自己保持回路",
  "category": "PLC",
  "tags": ["PLC", "自己保持", "ラダー"],
  "summary": "基本自己保持回路。押ボタン起動・停止回路の標準パターン。",
  "files": [
    "Ladder/self-hold-example.pdf"
  ],
  "updatedAt": "2026-06-21"
}
```

---

## ID 命名規則

```
{カテゴリ略}-{トピック英大文字}-{連番3桁}
```

| 例 | 意味 |
|----|------|
| `PLC-SELF-HOLD-001` | PLC · 自己保持 · 1 件目 |
| `CAM-POE-POWER-002` | 防犯カメラ · PoE 電源 · 2 件目 |
| `LAN-VLAN-SETUP-001` | LAN · VLAN 設定 |

- 英数字とハイフンのみ
- 連番はカテゴリ+トピック内でインクリメント

---

## 保存先

| 環境 | パス |
|------|------|
| QNAP（将来） | `\\192.168.1.10\TiSLY\AI\KnowledgeCards\{id}.json` |
| ローカル（v1） | `server/data/knowledge/KnowledgeCards/{id}.json` |

---

## 検索インデックス連携

カード保存時に `SearchIndex/index.json` を自動再生成する。

インデックス 1 エントリ:

```json
{
  "id": "PLC-SELF-HOLD-001",
  "title": "自己保持回路",
  "category": "PLC",
  "tags": ["PLC", "自己保持", "ラダー"],
  "summary": "基本自己保持回路",
  "updatedAt": "2026-06-21"
}
```

v1 検索は `title` · `tags` · `summary` の部分一致（大文字小文字無視）。

---

## 将来拡張（v2 以降・未実装）

- `embedding` — ベクトル（QNAP Qsirch / 外部 LLM）
- `relatedProjectIds` — 過去案件リンク
- `author` · `reviewedAt` — 承認ワークフロー
- `locale` — 多言語
