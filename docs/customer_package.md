# First Customer Package（顧客引渡し資料）

## 内容

- ログインURL
- 初期PW（登録時発行 — 再発行は管理画面）
- 設備一覧
- QR一覧
- 保守連絡先

## API

- `GET /api/deployment-kit/package/:customerCode` — JSON
- `GET /api/deployment-kit/package/:customerCode/html` — HTML
- `GET /api/deployment-kit/package/:customerCode/pdf` — PDF ダウンロード

UI: `/customer/:customerCode/deploy` からリンク
