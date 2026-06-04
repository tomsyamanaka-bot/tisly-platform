# 営業デモ用 見積プレビュー

## 種類

| type | 内容 |
|------|------|
| `house` | 戸建てセキュリティ |
| `minpaku` | 民泊 |
| `factory` | 工場・倉庫 |

## プレビュー

`/sales` の「PDFプレビュー」ボタン → 新規タブで HTML 表示

```
GET /api/demo-kit/estimate-html/:type
```

実 PDF 未生成時は HTML をそのままお客様に見せる想定です。

## メタ情報

```
GET /api/demo-kit/estimates
```

各 type のタイトル・合計金額・htmlPath を返します。

## 今後（Phase 901+）

- Puppeteer で PDF バイナリ生成
- QNAP mock フォルダへの自動配置
