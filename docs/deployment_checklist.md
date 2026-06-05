# Deployment Checklist（導入チェックリスト）

## URL

- UI: `/deployment/checklist`
- API: `GET /api/deployment-kit/checklist?customerCode=TOMS003`

## 項目

電源 · LAN · ESP · Shelly · 通知 · TV · PWA · QR · 保守

全項目 OK で `POST /api/deployment-kit/checklist/:customerCode/complete` により導入完了。
