# Demo Floor Maps（Phase 821–860）

## 概要

各デモ顧客の PRO Remote 階層マップに **外周 / 1F / 2F** を配置します。

## ピン種別

- ESP, Shelly, Camera, PIR, Beam, Door, Light など

## 異常時の自動ジャンプ

`findAlertFloorTier()` により OFFLINE/WARNING のピン・機器がある階を返します。  
通知デモ（`POST /api/demo-kit/notifications/esp_fault` 等）実行時に `pro_operations` へ `floor_nav` を記録します。

## 図面アセット

- `/assets/demo-floor/perimeter.svg`
- `/assets/demo-floor/1f.svg`
- `/assets/demo-floor/2f.svg`

## 実装

- `server/src/demo-kit/demo-floor-maps.ts`
- 既存 `pro_floor_layers` / `pro_map_pins` テーブル
