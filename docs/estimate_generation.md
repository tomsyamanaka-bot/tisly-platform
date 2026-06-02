# TOMS 見積自動生成 — 運用ガイド

> **TOMS Phase 2-1** — Notion → Excel → PDF → メール通知  
> 最終更新: 2026-05-31

---

## 1. 概要

案件番号を指定するだけで、以下が自動実行されます。

```
案件番号指定
    ↓
Notion 現調DB データ取得
    ↓
TOMS標準見積フォーマット.xlsx 生成
    ↓
見積書.pdf 変換
    ↓
管理者メール送信（任意）
```

**QNAP 連携は Phase 3 以降** — 本フェーズではローカル `output/` への保存のみ。

---

## 2. セットアップ

### 2.1 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 2.2 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集:

| 変数 | 必須 | 説明 |
|------|------|------|
| `NOTION_API_TOKEN` | △ | Notion Integration トークン（未設定時はサンプルJSON使用） |
| `NOTION_PROJECT_DB_ID` | △ | 案件管理DB の ID |
| `NOTION_SITE_SURVEY_DB_ID` | △ | 現調DB の ID |
| `TOMS_SEND_EMAIL` | — | `true` でメール送信有効 |
| `SMTP_USER` / `SMTP_PASSWORD` | △ | SMTP 認証（メール送信時） |
| `ADMIN_EMAIL` | △ | 管理者通知先 |

### 2.3 Notion Integration 設定（本番運用時）

1. [Notion Integrations](https://www.notion.so/my-integrations) で Integration を作成
2. トークンを `NOTION_API_TOKEN` に設定
3. 各 DB に Integration を接続（⋯ → 接続 → Integration 選択）
4. DB ID を `.env` に設定

---

## 3. 使い方

### 3.1 基本コマンド

```bash
python scripts/generate_estimate.py TOMS-0001
```

### 3.2 オプション

| オプション | 説明 |
|-----------|------|
| `--dry-run` | データ取得のみ（ファイル出力なし） |
| `--no-email` | メール送信をスキップ |
| `--email` | メール送信を強制有効化 |
| `--output-dir PATH` | 出力先を上書き指定 |

### 3.3 サンプルデータでのテスト（Notion 未接続時）

`NOTION_API_TOKEN` 未設定の場合、`data/sample/TOMS-0001.json` が自動使用されます。

```bash
python scripts/generate_estimate.py TOMS-0001
```

**期待される出力:**

```
output/伝元/土浦寮/2026-05/見積書.xlsx
output/伝元/土浦寮/2026-05/見積書.pdf
```

### 3.4 メール送信付き実行

```bash
# .env で TOMS_SEND_EMAIL=true に設定するか
python scripts/generate_estimate.py TOMS-0001 --email
```

**件名:** `【見積作成完了】土浦寮`  
**添付:** 見積書.xlsx, 見積書.pdf

---

## 4. 運用手順

### 4.1 日常フロー

```
1. 現場担当が Notion 現調DB に入力（見積反映=ON）
2. 管理者が案件番号を確認
3. python scripts/generate_estimate.py {案件番号} を実行
4. output/ 配下の xlsx / pdf を確認
5. 管理者メールを確認（--email 使用時）
6. 問題なければお客様へ手動送信（Phase 2 では自動送信しない）
```

### 4.2 見積再生成

同一案件番号で再実行すると、同じ出力パスに上書き保存されます。

---

## 5. エラー対応

### 5.1 サンプルデータが見つからない

```
エラー: サンプルデータが見つかりません: data/sample/TOMS-0002.json
```

**対処:**
- Notion API を設定する（`.env` にトークンと DB ID）
- または `data/sample/{案件番号}.json` を作成

### 5.2 Notion API エラー（401 / 403）

**原因:** トークン無効、Integration 未接続

**対処:**
1. トークンを再発行
2. 対象 DB に Integration を接続
3. DB ID が正しいか確認

### 5.3 案件が見つからない

```
エラー: 案件番号 TOMS-9999 が Notion 案件管理DB に見つかりません。
```

**対処:**
- 案件番号のスペル確認（`TOMS-0001` 形式）
- 案件管理DB に該当レコードが存在するか確認

### 5.4 明細が 0 件

**原因:** 現調DB の「見積反映」がすべて OFF

**対処:**
- Notion 現調DB で見積反映チェックを ON にする

### 5.5 Excel 生成エラー

**原因:** openpyxl 未インストール、テンプレート破損

**対処:**
```bash
pip install openpyxl
```
テンプレートが無い場合は初回実行時に自動生成されます。

### 5.6 PDF 変換エラー

**優先順位:**
1. LibreOffice（`soffice --headless`）
2. Windows Excel COM（Excel インストール + pywin32）
3. reportlab フォールバック（自動）

LibreOffice を使う場合:
```bash
# Windows: LibreOffice をインストールし PATH に soffice を追加
soffice --version
```

reportlab フォールバックでも PDF は生成されます（レイアウトは簡易版）。

### 5.7 メール送信エラー

**対処:**
- `SMTP_USER`, `SMTP_PASSWORD`, `ADMIN_EMAIL` を確認
- Gmail の場合はアプリパスワードを使用
- `--no-email` でファイル生成のみ実行可能

---

## 6. ファイル構成

```
scripts/
  generate_estimate.py   # メイン CLI
  notion_client.py       # Notion API / サンプル
  excel_builder.py       # Excel 転記
  pdf_converter.py       # PDF 変換
  email_notifier.py      # メール通知
  config.py              # 設定

templates/
  TOMS標準見積フォーマット.xlsx   # 初回実行時に自動生成

data/sample/
  TOMS-0001.json         # テスト案件（伝元/土浦寮）

output/
  {顧客名}/{案件名}/{YYYY-MM}/
    見積書.xlsx
    見積書.pdf

docs/
  estimate_mapping.md    # データマッピング
  estimate_generation.md # 本ドキュメント
```

---

## 7. 成功条件チェックリスト

- [ ] `python scripts/generate_estimate.py TOMS-0001` がエラーなく完了
- [ ] `output/伝元/土浦寮/2026-05/見積書.xlsx` が生成される
- [ ] `output/伝元/土浦寮/2026-05/見積書.pdf` が生成される
- [ ] 明細 4 件（換気×2, 照明, 分電盤）が転記されている
- [ ] 税込合計 ¥558,800 が一致
- [ ] `--email` で管理者メールが送信される（SMTP 設定時）

---

## 8. 関連ドキュメント

- [estimate_mapping.md](./estimate_mapping.md) — Notion ↔ Excel 対応表
- [notion_database_design.md](./notion_database_design.md) — DB 設計
- [workflow.md](./workflow.md) — 業務フロー
- [future_roadmap.md](./future_roadmap.md) — Phase 3 以降（QNAP 等）
