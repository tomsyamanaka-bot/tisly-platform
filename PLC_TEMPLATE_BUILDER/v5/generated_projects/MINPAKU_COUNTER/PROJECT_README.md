# MINPAKU_COUNTER — 納品 README

> TiSLY PLC Builder v5.2 自動生成

## テンプレート

| 項目 | 内容 |
|------|------|
| テンプレートID | MINPAKU_COUNTER |
| 用途 | 入口赤外線、出口赤外線、人数カウント、満室表示、清掃モード |

---

## 案件情報

| 項目 | 内容 |
|------|------|
| 会社名 | TiSLY株式会社 |
| 現場名 | MINPAKU_COUNTER デモ案件 |
| 担当者 | 自動生成 |
| PLC型番 | FX5UJ-24MR/ES |

---

## フォルダ構成

```
MINPAKU_COUNTER/
├── PLC_PROGRAM/     … GX Works3 命令（GX3_COMMANDS.txt）
├── SPEC/            … 仕様書・I/O表
├── DRAWING/         … 配線図
├── TEST/            … 監査レポート
├── PROJECT_README.md … 本ファイル
└── PROJECT_META.json … 案件メタデータ
```

---

## I/O 一覧

| デバイス | 名称 | 種別 |
|---------|------|------|
| X0 | チェックイン完了 | Input |
| X1 | 非常停止 | Input |
| X2 | 入口赤外線 | Input |
| X3 | 出口赤外線 | Input |
| X4 | 清掃モード | Input |
| Y0 | 満室表示 | Output |
| Y1 | 人数カウント1 | Output |
| Y2 | 人数カウント2 | Output |
| Y3 | 人数カウント3 | Output |
| Y4 | 人数カウント4 | Output |

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

**TiSLY PLC Builder v5.2**
