# TiSLY PLC Builder v5.3 — spec_generator

自然文から PLC 仕様書・I/O 表・PLC 選定・電源推定を完全自動生成するモジュール群。

## 概要

```
自然文
  ↓
PLC仕様書 (PROJECT_SPEC.md)
  ↓
I/O表 (IO_ASSIGNMENT.csv)
  ↓
配線図 (WIRING_DIAGRAM.md)
  ↓
GX Works3命令 (GX3_COMMANDS.txt)
  ↓
案件フォルダ
  ↓
テスト (SPEC_TEST_REPORT.md)
  ↓
PASS
```

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `spec_builder.py` | 自然文 → 仕様書 / テストレポート生成 |
| `device_estimator.py` | PLC 型番・MeanWell 電源推定 |
| `io_allocator.py` | 機器数量抽出・X/Y 連番割付 |
| `spec_templates/` | 仕様書テンプレート |
| `README.md` | 本ファイル |

## 機能

### ① 自然文から仕様書生成

```python
from spec_builder import build_spec_from_text

text = """車屋の展示場を夜間監視したい。
赤外線4本。
人感センサー2台。
パトライト1台。
白色LED4台。"""

result = build_spec_from_text(text)
print(result.spec_md)
```

生成内容: 案件名 / 目的 / 入力一覧 / 出力一覧 / PLC型番 / 推奨電源 / 注意事項

### ② I/O 自動計算

| 入力 | 割付 |
|------|------|
| 赤外線 4 | X0〜X3 |
| PIR 2 | X4〜X5 |
| パトライト 1 | Y0 |
| LED 4 | Y1〜Y4 |

（`--full-spec` 実行時は夜間警戒・非常停止を先頭に自動追加）

### ③ PLC サイズ推定

| 条件 | 推定機種 |
|------|---------|
| 入出力小 | FX5U-24MR/ES |
| 入出力中 | FX5U-32MR/ES |
| 入出力大 | FX5U-48MR/ES |

### ④ 電源推定

| 規模 | MeanWell |
|------|----------|
| 小 | HDR-30-24 |
| 中 | HDR-60-24 |
| 大 | HDR-100-24 |

### ⑤ 自動チェック → SPEC_TEST_REPORT.md

- I/O 重複
- I/O 不足
- PLC 容量超過
- 未使用点（情報）

### ⑥ project_generator.py 連携

```bash
# サンプル文章で完全自動生成
python project_generator.py --full-spec

# 任意の自然文を指定
python project_generator.py --full-spec --text "車屋の展示場を夜間監視したい。赤外線4本。人感センサー2台。パトライト1台。白色LED4台。"

# ファイルから読み込み
python project_generator.py --full-spec --text-file my_request.txt
```

## 単体実行

```bash
cd PLC_TEMPLATE_BUILDER/v5/spec_generator
python spec_builder.py --text "赤外線4本。PIR2台。パトライト1台。白色LED4台。"
```

## モジュール API

```python
from io_allocator import parse_devices_from_text, allocate_io_from_quantities
from device_estimator import estimate_all
from spec_builder import build_spec_from_text, run_spec_validation
```

---

**TiSLY PLC Builder v5.3 — spec_generator**
