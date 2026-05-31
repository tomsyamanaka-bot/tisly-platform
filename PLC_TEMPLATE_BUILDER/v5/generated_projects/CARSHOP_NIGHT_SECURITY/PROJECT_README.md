# CARSHOP_NIGHT_SECURITY — 納品 README

> TiSLY PLC Builder v5.12 自動生成

## 案件情報

| 項目 | 内容 |
|------|------|
| 会社名 | TiSLY株式会社 |
| 現場名 | 車屋展示場 夜間監視 |
| 担当者 | 自動生成 |
| PLC型番 | FX5UJ-24MR/ES |

---

## フォルダ構成

```
CARSHOP_NIGHT_SECURITY/
├── PLC_PROGRAM/     … GX Works3 命令（GX3_COMMANDS.txt）
├── SPEC/            … 仕様書・I/O表・PLC選定
├── DRAWING/         … 配線図
├── TEST/            … 監査レポート
├── PROJECT_README.md … 本ファイル
└── PROJECT_META.json … 案件メタデータ
```

---

## I/O 一覧

| デバイス | 名称 | 種別 |
|---------|------|------|
| X0 | 夜間警戒 | Input |
| X1 | 非常停止 | Input |
| X2 | 外周センサー | Input |
| X3 | 赤外線2 | Input |
| X4 | 赤外線3 | Input |
| X5 | 赤外線4 | Input |
| X6 | 近接センサー | Input |
| X7 | PIR2 | Input |
| Y0 | 赤灯 | Output |
| Y1 | 白灯1 | Output |
| Y2 | 白灯2 | Output |
| Y3 | 白灯3 | Output |
| Y4 | 白灯4 | Output |

---

## PLC容量・拡張判定

> PLC_SELECTION.md の要約

選定PLC **FX5UJ-24MR/ES** — 入力 8/14 点（57.1%） / 出力 5/10 点（50.0%） / 判定: OK — 現在PLCで問題なし

| 項目 | 内容 |
|------|------|
| 推奨PLC | FX5UJ-24MR/ES |
| 拡張ユニット候補 | 不要 |
| 入力余裕 | 6 点（余裕率 42.9%） |
| 出力余裕 | 5 点（余裕率 50.0%） |

### 将来増設時の注意

- 予備入力・出力を **2点以上** 確保してください。
- 使用率 **80% 超** の場合は上位 PLC 本体または拡張ユニット（不要）を検討してください。
- 詳細は `SPEC/PLC_SELECTION.md` を参照してください。

---
## GX Works3 投入手順

1. GX Works3 で新規プロジェクト（FX5UJ-24MR/ES）を作成
2. ラダーエディタを **命令入力モード** に切替
3. `PLC_PROGRAM/GX3_COMMANDS.txt` を開き全文コピー
4. ラダー先頭セルに貼り付け → コンパイル（F4）
5. `SPEC/PROJECT_SPEC.md` と I/O 割付を突合

---

## 注意事項

- 通電前に `TEST/TEST_REPORT.md` が **PASS** であることを確認
- 配線は `DRAWING/WIRING_DIAGRAM.md` を参照
- 非常停止は最優先。実機投入前にテストスタンドで動作確認すること

---

**TiSLY PLC Builder v5.12**
