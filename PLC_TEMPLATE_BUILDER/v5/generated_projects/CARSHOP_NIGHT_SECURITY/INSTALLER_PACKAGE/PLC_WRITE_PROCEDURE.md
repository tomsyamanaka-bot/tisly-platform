# PLC 書込み手順 — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.26 — Installer Package**

## 手順

1. GX Works3 を起動
2. 新規プロジェクト → PLC 型番を SPEC/PLC_SELECTION.md に合わせて選択
3. `PLC_PROGRAM/GX3_COMMANDS.txt` を参考にラダー入力
4. シミュレータで X0→センサー→X1(非常停止) の順に動作確認
5. 実機へ書込み → RUN モード

## 確認項目

- [ ] M8012 / M8013 未使用（SM412/SM413 使用）
- [ ] Y0 単一コイル
- [ ] END 命令末尾

---

*TiSLY PLC Builder v5.26 — Installer Package*
