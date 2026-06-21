# TiSLY Monitoring Device Attachment ガイド（V3.4）

**対象:** 開発者 · 現調担当 · 監視センター運用  
**関連画面:** `/monitoring-3d-v2` · `/monitoring-map-assets-v1`  
**データ:** `server/data/monitoring/device-attachments.json`  
**完了報告スロット:** `server/data/monitoring/report-photo-slots.json`

---

## 目的

3D 監視画面の各センサー / カメラ / 設備から、**現調写真 · 仕様書 PDF · 完了報告 PDF · Customer 説明** へすぐ飛べる入口を提供する。

V3.4 では Monitoring を単体デモではなく、現調 PWA · PDF · Customer UI とつなぐ。

---

## device attachment データ構造

```json
{
  "siteId": "DEMO-HOME-001",
  "deviceId": "frontDoor",
  "deviceName": "玄関",
  "floorLevel": "1f",
  "areaName": "玄関",
  "attachments": [
    {
      "attachmentId": "att-…",
      "type": "survey_photo",
      "title": "玄関 現調写真",
      "safeLabel": "玄関 現調写真",
      "source": "内部のみ — API では非公開",
      "previewUrl": "/icons/icon-128.png",
      "openUrl": "/icons/icon-128.png",
      "createdAt": "2026-06-21T…",
      "customerVisible": true,
      "reportVisible": false
    }
  ]
}
```

### type 一覧

| type | 用途 |
|------|------|
| `survey_photo` | 現調写真 |
| `before_photo` | 施工前 |
| `after_photo` | 施工後 |
| `wiring_photo` | 配線 |
| `device_photo` | 設備写真 |
| `spec_pdf` | 仕様書 PDF |
| `completion_report_pdf` | 完了報告 PDF |
| `estimate_pdf` | 見積 PDF |
| `invoice_pdf` | 請求 PDF（Customer UI では非表示可） |
| `manual_pdf` | 取扱説明 |
| `customer_knowledge` | Customer 説明 |
| `site_drawing` | 図面 |

**Customer UI:** `invoice_pdf` は `customerVisible: false` で非表示構造を維持。

---

## API

```http
GET /api/monitoring/v1/device-attachments?siteId=DEMO-HOME-001&deviceId=frontDoor
POST /api/monitoring/v1/device-attachments
DELETE /api/monitoring/v1/device-attachments/:attachmentId
```

- `siteId` / `deviceId` は sanitize 済み
- QNAP / SMB / WebDAV / project-storage の内部パスはレスポンスに出さない
- `safeLabel` 中心で表示
- attachment なし → 空配列

---

## 3D 右パネル資料タブ

`/monitoring-3d-v2` 右パネル 4 タブ:

| タブ | 内容 |
|------|------|
| 状態 | センサー一覧 · mapAsset 状態 |
| カメラ | LIVE モック |
| 資料 | 写真 / PDF / Customer 連携 · 完了報告候補 |
| ログ | デバイス関連イベント |

資料タブボタン: **写真を見る** · **PDFを見る** · **Customer説明を見る** · **完了報告に使う**

---

## 完了報告写真スロット

```http
GET /api/monitoring/v1/report-photo-slots?siteId=DEMO-HOME-001
POST /api/monitoring/v1/report-photo-slots
{ "siteId", "deviceId", "attachmentId" }
```

- `reportVisible: true` の写真のみ候補
- 最大 **6 枚**（完了報告 PDF: 1 ページ 2 枚 × 3 段）
- 保存: `report-photo-slots.json`

---

## Customer UI 連携

センサー選択時のリンク:

- お客様向け説明 → `/knowledge-customer-detail-v1?id=…&ref=…`
- 案件ページ → `/knowledge-customer-project-v1?ref=…`
- Site Map → `/knowledge-customer-site-map-v1?ref=…`
- 関連資料 → 案件ページ `#materials`

---

## 3D 写真ピン

- device attachment に写真がある設備上に 📷 ピン表示
- クリック → 資料タブへ
- 色: customerVisible=**青** · reportVisible=**緑** · 内部のみ=**グレー**
- alert ピン（赤）とは別レイヤー

---

## DEMO-FACTORY-001

工場 seed: 骨材ヤード · サイロ · ミキサー · コンベア · 出荷ゲート · 操作室 に attachment あり。

---

## QNAP 保存に差し替える方針

1. `source` に QNAP 相対パスを保持（API 非公開）
2. `openUrl` / `previewUrl` は `/api/knowledge/files-v1` または Customer document adapter 経由
3. WebDAV 接続は `QNAP_MODE=webdav` — mock fallback 維持
4. Customer UI には内部パスを出さない

---

## 既知の PWA ルート不具合（Phase0）

| パス | 状態 | 代替 |
|------|------|------|
| `/estimate` | 404 · 読み込み止まり報告 | `/estimate-v1` |
| `/invoice` | 404 | `/estimate-v1` 請求タブ |
| `/drawing-editor` | 404 | `/survey-drawing-v1` |

一覧: `/route-map`

---

## コード参照

| ファイル | 役割 |
|----------|------|
| `monitoring-device-attachments-v1.ts` | ストア · seed · sanitize |
| `monitoring-report-photo-slots-v1.ts` | 完了報告候補 · 最大6枚 |
| `tisly-monitoring-v1.ts` | API ルート |
| `monitoring-3d-v2/js/monitoring-3d-v2.js` | 資料タブ · 写真ピン |
| `server/test/tisly-monitoring-3d-v34.test.ts` | V3.4 テスト |
