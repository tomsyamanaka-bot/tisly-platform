# TiSLY Monitoring mapAsset ガイド（V3.1）

**対象:** 開発者 · 現調担当 · 3Dスキャン取り込み担当  
**関連画面:** `/monitoring-map-assets-v1` · `/monitoring-3d-v2`  
**保存先:** `server/data/monitoring/map-assets.json`

---

## 目的

Polycam / RoomPlan / Scaniverse などから出力した 3D データを、将来 TiSLY 監視画面（Three.js）に載せるための **受け皿・メタデータ・キャリブレーション** を整備する。

V3.1 時点では **実 LiDAR ファイルの読み込みは未接続**。メタデータ登録 + placeholder mesh 表示まで。

---

## 推奨形式

| ソース | 推奨 fileType | 備考 |
|--------|---------------|------|
| **Polycam** | `glb` | GLB エクスポート推奨。色付き mesh 向け |
| **RoomPlan** | `json` / `usdz` | iPhone LiDAR · Apple RoomPlan 出力想定 |
| **Scaniverse** | `glb` / `obj` | 外周・室内ともに GLB 優先 |
| **manual** | 任意 | 手動調整・合成データ |
| **mock** | `unknown` | デモ・開発用 |

---

## フロア分割（floorLevel）

| floorLevel | 用途 |
|------------|------|
| `perimeter` | 外周 · 門扉 · 駐車場 · フェンス |
| `1f` | 1階室内 |
| `2f` | 2階室内 |
| `roof` | 屋上（任意） |

**原則:** 1F / 2F / 外周を **別 mapAsset として登録** し、`activeAsset` で表示対象を切替。

---

## mapType

| mapType | 説明 |
|---------|------|
| `mesh` | ポリゴンメッシュ（GLB/OBJ 等） |
| `pointcloud` | 点群（PLY 等） |
| `floorplan` | 平面レイアウト（RoomPlan JSON 等） |
| `building_shell` | 建物外殻 |
| `placeholder` | fileUrl 未接続時の仮表示 |

---

## transform / キャリブレーション

センサー位置とスキャンデータを合わせる項目:

| 項目 | 説明 |
|------|------|
| `position.x/y/z` | ワールド座標オフセット |
| `rotation.x/y/z` | 回転（度） |
| `scale.x/y/z` | スケール |
| `heightOffset` | 高さオフセット（Y 加算） |

**操作:** mapAsset Manager の「フロアキャリブレーション」で保存 · リセット · 3Dプレビュー。

---

## センサー位置合わせ（device-layout-overrides）

3D 画面の「センサー再配置」または API で座標入力:

- 保存先: `server/data/monitoring/device-layout-overrides.json`
- 対象 deviceType: `camera` · `sensor` · `door` · `window` · `light` · `panel` · `gate`

---

## API

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/monitoring/v1/map-assets?siteId=` | 一覧 · active · fallback · uploadGuide |
| POST | `/api/monitoring/v1/map-assets` | メタデータ登録 |
| PATCH | `/api/monitoring/v1/map-assets/:assetId` | transform · active 切替 |
| GET | `/api/monitoring/v1/device-layout-overrides?siteId=` | センサー座標オーバーライド一覧 |
| POST | `/api/monitoring/v1/device-layout-overrides` | 座標保存 |

---

## QNAP 保存への将来接続案

1. 実ファイル保存: `\\192.168.1.10\TiSLY\monitoring\{siteId}\map-assets\{assetId}.{ext}`
2. WebDAV 経由で VPS から参照 · または MotherShip Explorer 連携
3. `fileUrl` を `/api/monitoring/v1/map-assets/files/:assetId` 等に差し替え
4. Three.js `GLTFLoader` / `OBJLoader` で mesh 読み込み（CDN 依存解消は別フェーズ）

---

## Customer / Knowledge 連携

- センサークリック時の `relatedKnowledgeIds` は V3 から維持
- Customer Detail · Site Map · PDF リンクは `/api/monitoring/v1/3d-sensor/:id` 経由

---

## 確認 URL

- https://tisly.jp/monitoring-map-assets-v1?siteId=DEMO-HOME-001
- https://tisly.jp/monitoring-3d-v2?siteId=DEMO-HOME-001
- https://tisly.jp/api/monitoring/v1/map-assets?siteId=DEMO-HOME-001
