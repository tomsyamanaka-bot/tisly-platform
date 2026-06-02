# GX Works3 完成プロジェクト — CARSHOP_NIGHT_SECURITY

FX5UJ-24MR/ES 向け **完成 .gx3 プロジェクト** です。  
命令貼付けではなく、GX Works3 で直接開いて変換・書込みできます。

## 同梱ファイル

| ファイル | 内容 |
|----------|------|
| `CARSHOP_NIGHT_SECURITY.gx3` | GX Works3 プロジェクト本体 |
| `IO_LIST.csv` | I/O 一覧 |
| `DEVICE_COMMENTS.csv` | デバイスコメント（GX Works3 インポート用） |
| `LADDER_DIAGRAM.pdf` | ラダー図 PDF |
| `TEST_PROCEDURE.md` | テスト手順 |

## 手順（最短）

1. `CARSHOP_NIGHT_SECURITY.gx3` をダブルクリック（または GX Works3 から開く）
2. プログラムチェック → コンパイル
3. PLC へ書込み → RUN
4. `TEST_PROCEDURE.md` に従い動作確認

## 注意

- 初回打开時に **再コンパイル** を求められた場合は実行してください
- デバイスコメントは `DEVICE_COMMENTS.csv` を **デバイスコメント一括登録** で取込可能
- ソース命令は `../GX3_COMMANDS.txt`（X6=近接センサー）

---
TiSLY GX3 Project Builder v1.0.0
