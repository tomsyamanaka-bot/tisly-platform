# PRO Remote Floor Map System (Phase 481–500)

## 階層

縦スクロール（スマホスワイプ）:

1. **外周** (`perimeter`)
2. **1F** (`1f`)
3. **2F** (`2f`)

## API

| Method | Path |
|--------|------|
| GET | `/api/customer/:code/pro-remote/floor-stack` |
| POST | `/api/customer/:code/pro-remote/floor-stack/pins` |
| DELETE | `/api/customer/:code/pro-remote/floor-stack/pins/:pinId` |
| GET | `/api/customer/:code/pro-remote/floor-stack/alert-jump` |

## ピン種類

`camera`, `beam`, `pir`, `door`, `window`, `relay`, `esp`, `shelly`, `speaker`, `light`

## 状態色

- ONLINE — 緑
- WARNING — 黄
- OFFLINE — 赤

## 異常時

`alert-jump` が異常階 `tier` を返却。UI は該当セクションへ `scrollIntoView`。

## 現調連携

`POST /api/survey/drawing/:id/import-pro` + `layerId` で現調図面を `uploads/floorplans` にコピーし PRO 層に表示。

## UI

`/customer/:code/pro-remote` — `pro-remote-floor-map.js`
