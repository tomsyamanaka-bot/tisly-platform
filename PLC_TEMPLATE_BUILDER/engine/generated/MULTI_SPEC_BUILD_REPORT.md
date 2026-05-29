# MULTI_SPEC_BUILD_REPORT — TiSLY PLC Builder v3

> 複数仕様からの GX Works3 命令リスト一括生成テスト

---

## サマリー

| 仕様 | 入力 | 出力 | 命令行数 | 判定 |
|------|------|------|:--------:|:----:|
| CARSHOP_SECURITY | `sample_specs/carshop_security.txt` | `generated/GXW3_GENERATED_CARSHOP_SECURITY.txt` | 41 | PASS |
| WAREHOUSE_SECURITY | `sample_specs/warehouse_security.txt` | `generated/GXW3_GENERATED_WAREHOUSE_SECURITY.txt` | 41 | PASS |
| MINPAKU_COUNTER | `sample_specs/minpaku_counter.txt` | `generated/GXW3_GENERATED_MINPAKU_COUNTER.txt` | 41 | PASS |

**総合判定: PASS**

---

## 監査項目（全仕様共通）

| 項目 | 確認内容 |
|------|---------|
| M8012 / M8013 | 0 件（使用禁止） |
| SM412 / SM413 | 各 1 件以上（クロック使用） |
| OUT Y0 | 1 回のみ（M20 経由） |
| OUT 重複 | 各 Y 出力は 1 回のみ |
| END | 末尾に必須 |

---

## 仕様別監査結果

### CARSHOP_SECURITY

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 不使用 | PASS | 0 件 |
| M8013 不使用 | PASS | 0 件 |
| SM412 使用 | PASS | 1 件 |
| SM413 使用 | PASS | 2 件 |
| OUT Y0 は 1 回 | PASS | 1 回 |
| OUT 重複なし | PASS | 重複なし |
| Y0 は M20 経由 | PASS | M20 → Y0 |
| END あり | PASS | 末尾 END |
| GX Works3 投入可能 | PASS | 監査項目すべて PASS |

**判定: PASS**

### WAREHOUSE_SECURITY

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 不使用 | PASS | 0 件 |
| M8013 不使用 | PASS | 0 件 |
| SM412 使用 | PASS | 1 件 |
| SM413 使用 | PASS | 2 件 |
| OUT Y0 は 1 回 | PASS | 1 回 |
| OUT 重複なし | PASS | 重複なし |
| Y0 は M20 経由 | PASS | M20 → Y0 |
| END あり | PASS | 末尾 END |
| GX Works3 投入可能 | PASS | 監査項目すべて PASS |

**判定: PASS**

### MINPAKU_COUNTER

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| M8012 不使用 | PASS | 0 件 |
| M8013 不使用 | PASS | 0 件 |
| SM412 使用 | PASS | 1 件 |
| SM413 使用 | PASS | 2 件 |
| OUT Y0 は 1 回 | PASS | 1 回 |
| OUT 重複なし | PASS | 重複なし |
| Y0 は M20 経由 | PASS | M20 → Y0 |
| END あり | PASS | 末尾 END |
| GX Works3 投入可能 | PASS | 監査項目すべて PASS |

**判定: PASS**


---

**TiSLY PLC Builder v3 — MULTI_SPEC_BUILD_REPORT**
