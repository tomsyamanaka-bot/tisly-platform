# 営業 UI 多言語（Phase946）

## 対応

- 日本語（既定）/ English
- `localStorage` キー: `tisly_sales_locale`
- 辞書: `server/public/js/i18n/sales-en.json`

## 使い方

主要ラベルに `data-i18n` / `data-i18n-fallback` を付与。  
`/sales` 右上の **日本語 / English** で切替。

実装: `server/public/js/sales-i18n.js`
