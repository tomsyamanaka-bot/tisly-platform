# TiSLY株式会社_本社ビル1F警備 — 納品 README

> TiSLY PLC Builder v5.0 自動生成

---

## 案件情報

| 項目 | 内容 |
|------|------|
| 会社名 | TiSLY株式会社 |
| 現場名 | 本社ビル1F警備 |
| 担当者 | 山田太郎 |
| PLC型番 | FX5UJ-24MR/ES |

---

## フォルダ構成

```
TiSLY株式会社_本社ビル1F警備/
├── PLC_PROGRAM/     … GX Works3 命令（GX3_COMMANDS.txt）
├── SPEC/            … 仕様書・I/O表
├── DRAWING/         … 配線図
├── TEST/            … 監査レポート
└── README.md        … 本ファイル
```

---

## I/O 一覧

| デバイス | 名称 | 種別 |
|---------|------|------|
| X0 | 警戒スイッチ | Input |
| X1 | 非常停止 | Input |
| X2 | 外周センサー | Input |
| X3 | 赤外線2 | Input |
| X4 | 近接センサー | Input |
| X5 | マグネット1 | Input |
| X6 | マグネット2 | Input |
| X7 | マグネット3 | Input |
| Y0 | 赤灯 | Output |
| Y1 | 白灯1 | Output |
| Y2 | 白灯2 | Output |
| Y3 | 白灯3 | Output |
| Y4 | 白灯4 | Output |
| Y5 | ブザー | Output |

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

**TiSLY PLC Builder v5.0**
