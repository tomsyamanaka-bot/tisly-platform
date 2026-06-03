# QR カメラスキャン（Phase 361–380）

## 概要

施工 PWA（`/customer/:code/install`）の QR タブで、スマホカメラからプロビジョニング JSON を読み取り、`POST .../devices/qr/claim` に送信します。

## クライアント

| 優先 | 方式 | 備考 |
|------|------|------|
| 1 | `BarcodeDetector` API | Chrome Android 等で利用可 |
| 2 | [html5-qrcode](https://github.com/mebjas/html5-qrcode)（CDN） | フォールバック |
| 3 | 手入力 | textarea に JSON 貼り付け |

## フロー

1. **カメラでスキャン** → `#qr-payload` に JSON 設定
2. 現場 / フロア選択（任意）
3. **QR Claim** → サーバー `claimQrProvisioning`

## オフライン

QR トークンは期限付きのため、オフライン時は `localStorage` キューに積み、復帰後 `POST .../install/sync` で送信（競合時は拒否・警告 — `docs/offline_conflict_resolution.md`）。

## 関連

- `server/public/js/installer-mode.js`
- `docs/qr_device_provisioning.md`
