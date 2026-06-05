# PRO Remote Floor Stack RC2

Phase 1161–1200 の PRO Remote 縦スクロールフロアマップ仕様です。

## 階構成

- `perimeter`（外周）
- `1f`（1F）
- `2f`（2F）
- 屋上レイヤーは作成しない

## API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/customer/:code/pro-remote/floor-stack?rc=2` | RC2 拡張ピン（カメラ紐付け・blink） |
| POST | `/api/customer/:code/pro-remote/focus` | 階フォーカス + TV 連携 |

## UI 機能

- 縦スクロール: 外周 → 1F → 2F
- センサー異常時: 該当階へ自動スクロール、ピン点滅
- ピンタップ: TVへ送る / 施工写真 / フォーカス
- カメラ紐付け: `cameraId` / `linkedCameraLabel` on pins

## 関連

- `server/src/pro-remote/floor-stack-rc2.ts`
- `server/public/js/pro-remote-floor-map.js`
