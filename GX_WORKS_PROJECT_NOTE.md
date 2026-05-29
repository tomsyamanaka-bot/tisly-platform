# GX Works プロジェクト作成メモ

## プロジェクト設定

| 項目 | 値 |
|------|-----|
| プロジェクト名 | **TiSLY_HOME_Security_DEMO** |
| プログラム名 | MAIN（または MAIN_PRG） |
| 言語 | ラダー（LAD） |

## ファイル対応

| 本リポジトリ | GX Works 内 |
|--------------|-------------|
| `ladder/TiSLY_HOME_Security_DEMO.il` | 命令リスト参照・転記 |
| `ladder/TiSLY_HOME_Security_DEMO_LADDER.txt` | ラダー図テキスト（段コメント付き） |
| `ladder/IO_ASSIGNMENT.csv` | デバイスコメント一括登録の参照 |
| `README.md` | 動作仕様・配線・連携前提 |

## 転記後チェックリスト

- [ ] 段6で Y0 に二重コイルがない（M20 → Y0 のみ）
- [ ] M8012 / M8013 が PLC 機種で有効（FX 標準装備）
- [ ] X1 非常停止の極性が実配線と一致
- [ ] 100V 出力は外部リレー経由であること
- [ ] RUN 中に X0 OFF / X1 ON で全消灯すること
