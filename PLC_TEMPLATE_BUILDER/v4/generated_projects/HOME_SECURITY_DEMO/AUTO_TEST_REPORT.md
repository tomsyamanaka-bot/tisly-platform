# AUTO_TEST_REPORT — TiSLY PLC Builder v4.7

> 自動テスト実行レポート

---

## 履歴管理メタ

| 項目 | 値 |
|------|-----|
| builder_version | TiSLY PLC Builder v4.7 |
| test_datetime | 2026-05-29T22:11:32Z |
| tested_project | HOME_SECURITY_DEMO |
| test_result | PASS |
| next_action | Git 保存: git add . && git commit -m "Add TiSLY PLC Builder v4.7 history management" && git push |

---

## 実行概要

| 項目 | 値 |
|------|-----|
| 実行日時 (UTC) | 2026-05-29T22:11:32Z |
| テストスクリプト | test_builder.py |
| 対象 | build.py --sample |
| 出力先 | generated_projects/HOME_SECURITY_DEMO |

---

## チェックリスト

- ✓ build.py --sample: 正常終了
- ✓ 案件フォルダ生成: generated_projects\HOME_SECURITY_DEMO
- ✓ GXW3_COMMANDS.txt 存在: OK
- ✓ IO_ASSIGNMENT.csv 存在: OK
- ✓ WIRING_DIAGRAM.md 存在: OK
- ✓ PROJECT_README.md 存在: OK
- ✓ TEST_REPORT.md 存在: OK
- ✓ PROJECT_META.json 存在: OK
- ✓ M8012 が0件: 0 件
- ✓ M8013 が0件: 0 件
- ✓ SM412 が存在: 1 件
- ✓ SM413 が存在: 2 件
- ✓ OUT Y0 が1回: 1 回
- ✓ END が存在: 末尾 END
- ✓ TEST_REPORT.md 総合判定 PASS: 記載あり

---

## テスト結果

| 項目 | 結果 | 詳細 |
|------|:----:|------|
| build.py --sample | PASS | 正常終了 |
| 案件フォルダ生成 | PASS | generated_projects\HOME_SECURITY_DEMO |
| GXW3_COMMANDS.txt 存在 | PASS | OK |
| IO_ASSIGNMENT.csv 存在 | PASS | OK |
| WIRING_DIAGRAM.md 存在 | PASS | OK |
| PROJECT_README.md 存在 | PASS | OK |
| TEST_REPORT.md 存在 | PASS | OK |
| PROJECT_META.json 存在 | PASS | OK |
| M8012 が0件 | PASS | 0 件 |
| M8013 が0件 | PASS | 0 件 |
| SM412 が存在 | PASS | 1 件 |
| SM413 が存在 | PASS | 2 件 |
| OUT Y0 が1回 | PASS | 1 回 |
| END が存在 | PASS | 末尾 END |
| TEST_REPORT.md 総合判定 PASS | PASS | 記載あり |

---

## build.py --sample 出力

```
TiSLY PLC Builder v4.7

案件名: HOME_SECURITY_DEMO
仕様: C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v4\sample_spec.txt
出力: C:\Users\yaman\TiSLY_HOME_Security_DEMO\PLC_TEMPLATE_BUILDER\v4\generated_projects\HOME_SECURITY_DEMO

  - GXW3_COMMANDS.txt
  - IO_ASSIGNMENT.csv
  - WIRING_DIAGRAM.md
  - PROJECT_README.md
  - TEST_REPORT.md
  - PROJECT_META.json

  [PASS] M8012 チェック: 0 件（0 が正常）
  [PASS] M8013 チェック: 0 件（0 が正常）
  [PASS] SM412 チェック: 1 件
  [PASS] SM413 チェック: 2 件
  [PASS] OUT 重複チェック: 重複なし
  [PASS] OUT Y0 チェック: 1 回
  [PASS] END チェック: 末尾 END
  [PASS] I/O 重複なし: 重複なし

総合判定: PASS

案件フォルダ自動生成 完成
```

---

**総合判定: PASS**

**TiSLY PLC Builder v4.7 — AUTO_TEST_REPORT**
