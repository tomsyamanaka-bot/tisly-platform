# TEST_REPORT — TiSLY PLC Builder v5.2

> 自動監査レポート

---

## I/O 割付確認

| Device | Name | Type |
|--------|------|------|
| X0 | ライン起動 | Input |
| X1 | 非常停止 | Input |
| X2 | 安全カーテン | Input |
| X3 | 設備異常入力 | Input |
| Y0 | パトライト | Output |
| Y1 | ブザー | Output |
| Y2 | 搬送停止 | Output |
| Y3 | 安全警告灯 | Output |
| Y4 | 設備異常表示 | Output |

---

## 監査項目

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 チェック | PASS | 0 件 |
| M8013 チェック | PASS | 0 件 |
| SM412 チェック | PASS | 1 件 |
| SM413 チェック | PASS | 2 件 |
| OUT 重複チェック | PASS | 重複なし |
| OUT Y0 チェック | PASS | 1 回 |
| END チェック | PASS | 末尾 END |
| I/O 重複なし | PASS | 重複なし |

---

## GX Works3 命令サマリー

- 命令行数: 41
- 部品: 002, 003, 004, 006, 007

---

**総合判定: PASS**

**TiSLY PLC Builder v5.2 — TEST_REPORT**
