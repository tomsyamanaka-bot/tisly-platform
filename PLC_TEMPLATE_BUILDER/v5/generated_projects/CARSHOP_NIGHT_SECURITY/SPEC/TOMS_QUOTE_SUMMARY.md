# TOMS 見積連携サマリー — 車屋展示場 夜間監視

> TiSLY PLC Builder v5.6 自動生成

---

## 案件情報

| 項目 | 内容 |
|------|------|
| 案件名 | 車屋展示場 夜間監視 |
| PLC型番 | FX5UJ-24MR/ES |
| 電源型番 | MeanWell HDR-60-24 |
| 入力点数 | 8 点 |
| 出力点数 | 5 点 |
| 見積項目数 | 8 件 |

---

## TOMS 標準フォーマット転記メモ

- `TOMS_QUOTE_ITEMS.csv` の各行を TOMS 標準見積書の明細行へ転記してください。
- **UnitPrice** / **Amount** は本 CSV では空欄です。TOMS 側で単価・金額を入力してください。
- **Model** が空欄の行は、現場条件に合わせて型番を追記してください。
- PLC・24V電源は BOM から型番を自動転記済みです。
- 100V 白灯は中継リレー経由のため、リレー・接点ブロックを別途見積に含めてください。

---

## 連携フロー

```
見積メモ
    ↓
BOM.csv / ROUGH_ESTIMATE.md
    ↓
TOMS_QUOTE_ITEMS.csv（本ファイル群）
    ↓
TOMS 標準見積書フォーマット（TOMS_QUOTE.xlsx / 手動転記）
```

---

**TiSLY PLC Builder v5.6 — TOMS_QUOTE_SUMMARY**
