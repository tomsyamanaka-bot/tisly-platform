# TiSLY Knowledge — フォルダ構造と登録ルール

**最終更新:** 2026-06-21  
**目的:** QNAP を単なる保存先ではなく **TiSLY Knowledge（会社の頭脳）** として使うための標準構成。

AI 検索は将来フェーズ。現時点では **データ構造 · 登録ルール · 検索インデックス** を整備する。

---

## QNAP 想定構成（MotherShip / AI 配下）

```
\\192.168.1.10\TiSLY\AI\
├─ Standards/        … 社内標準・規格・安全基準
├─ Procedures/       … 作業手順書・チェックリスト原本
├─ Troubles/         … トラブルシューティング・過去事例
├─ Templates/        … 見積・報告・メール等のひな形
├─ Ladder/           … PLC ラダー・制御回路（GX Works 等）
├─ Materials/        … 部材カタログ・仕様・取説 PDF
├─ Tools/            … 工具・測定器・校正情報
├─ Notes/            … 現場メモ・打合せ記録（非案件）
├─ KnowledgeCards/   … knowledge-card.json（検索の最小単位）
└─ SearchIndex/      … キーワードインデックス（自動生成）
```

実装: `server/src/knowledge/knowledge-paths-v1.ts` · `server/src/storage/mothership-paths-v1.ts`

---

## ローカル開発用ミラー（PWA 登録 UI）

本番 QNAP 同期前は **`server/data/knowledge/`** にローカル保存する。

```
server/data/knowledge/
├─ Standards/
├─ Procedures/
├─ Troubles/
├─ Templates/
├─ Ladder/
├─ Materials/
├─ Tools/
├─ Notes/
├─ KnowledgeCards/     … {id}.json
├─ SearchIndex/        … index.json（API が自動更新）
└─ attachments/        … 添付ファイル参照用（任意）
```

---

## フォルダ用途一覧

| フォルダ | 用途 | 保存例 |
|----------|------|--------|
| **Standards** | 社内標準・安全規程・施工基準 | `防犯カメラ_施工基準_v2.pdf` |
| **Procedures** | 作業手順・初期設定・検査手順 | `NVR初期設定_手順.md` |
| **Troubles** | 障害対応・FAQ・再発防止 | `PoE不通_チェックリスト.pdf` |
| **Templates** | 帳票・メール・見積ひな形 | `見積_標準テンプレ.xlsx` |
| **Ladder** | PLC ラダー・自己保持・インターロック | `self-hold-example.pdf` |
| **Materials** | 部材仕様・カタログ・取説 | `Hikvision_DS-2CD_取説.pdf` |
| **Tools** | 工具・測定器・校正 | `LANテスター_使い方.pdf` |
| **Notes** | 現場メモ・勉強会・技術メモ | `2026-06-21_養殖PLCメモ.txt` |
| **KnowledgeCards** | カード JSON（検索単位） | `PLC-SELF-HOLD-001.json` |
| **SearchIndex** | タイトル/タグ/概要のインデックス | `index.json` |

---

## Knowledge Card 登録ルール

1. **1 トピック = 1 カード** — 詳細は [knowledge-card-spec.md](./knowledge-card-spec.md)
2. **id** は `{カテゴリ略}-{トピック}-{連番}` 例: `PLC-SELF-HOLD-001`
3. **category** は [master/work-categories.json](../master/work-categories.json) から選択
4. **files[]** は AI 配下の相対パス（例: `Ladder/self-hold-example.pdf`）
5. **現調写真 / 完了報告写真は混在禁止** — 案件 PDF ルールと同様（[PROJECT_STATUS.md](./autonomous/PROJECT_STATUS.md)）
6. **SearchIndex** はカード保存時に API が再生成（手編集不要）

---

## API · UI（v1 + Acquisition v1）

| 種別 | パス |
|------|------|
| 登録 UI | `/knowledge-v1` |
| 現場クイック | `/knowledge-quick-v1` — 写真+メモ30秒登録 |
| 案件→ナレッジ | 案件詳細 `/projects-v1` →「Knowledgeへ登録」 |
| 検索 | `GET /api/knowledge/search?q=` · `?type=photo` · `?type=pdf` |
| 一覧 | `GET /api/knowledge/cards` |
| 登録 | `POST /api/knowledge/cards` |
| 案件変換 | `POST /api/knowledge/from-project/:projectId` |
| 写真タグ | `POST /api/knowledge/photos/tag` |
| PDF登録 | `POST /api/knowledge/pdfs/register` |
| クイック | `POST /api/knowledge/quick` |
| QNAP同期 | Worker `knowledge-qnap-sync` · `GET /api/knowledge/qnap-sync/status` |
| カテゴリ | `GET /api/knowledge/categories` |

検索対象（v1）: **タイトル · タグ · 概要** のみ。AI セマンティック検索は未実装。

---

## 関連ドキュメント

- [knowledge-card-spec.md](./knowledge-card-spec.md) — カード JSON 仕様
- [knowledge-roadmap.md](./knowledge-roadmap.md) — AI 検索ロードマップ
- [qnap-ai-plan.md](./qnap-ai-plan.md) — QNAP Document Center / Qsirch 連携案
- [mothership.md](./mothership.md) — MotherShip 全体構成
