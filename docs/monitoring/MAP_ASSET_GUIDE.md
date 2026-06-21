# TiSLY Monitoring mapAsset ガイド（V3.3）

**対象:** 開発者 · 現調担当 · 3Dスキャン取り込み担当  
**関連画面:** `/monitoring-map-assets-v1` · `/monitoring-3d-v2`  
**メタデータ:** `server/data/monitoring/map-assets.json`  
**実ファイル:** `server/uploads/monitoring/{siteId}/`

---

## 目的

Polycam / RoomPlan / Scaniverse などから出力した 3D データを TiSLY 監視画面（Three.js）に載せる **実ファイルアップロード + 複数形式表示** 入口。

V3.3 時点で **GLB/GLTF/OBJ/PLY は Three.js Loader で表示可能**。USDZ は登録可だが **GLB 変換推奨**。

---

## 推奨形式

| ソース | 推奨 fileType | 備考 |
|--------|---------------|------|
| **Polycam** | `glb` | **最優先。** GLB エクスポート推奨。色付き mesh 向け |
| **RoomPlan** | `json` / `usdz` | iPhone LiDAR · Apple RoomPlan 出力想定（3D表示は GLB 変換推奨） |
| **Scaniverse** | `glb` / `obj` | 外周・室内ともに **GLB 優先** |
| **manual** | 任意 | 手動調整・合成データ |
| **mock** | `unknown` | デモ・開発用 |

**初期運用:** GLB が最優先。RoomPlan JSON/USDZ は将来 Loader 追加予定。

---

## ファイルサイズ上限

| 種別 | 上限 |
|------|------|
| 3D mesh（GLB/GLTF/OBJ/PLY/USDZ） | **100 MB** |
| 画像（JPG/PNG） | **10 MB** |
| JSON（RoomPlan 等） | **5 MB** |

---

## アップロード手順

1. `/monitoring-map-assets-v1?siteId=DEMO-HOME-001` を開く
2. タイトル · sourceType · floorLevel · mapType を選択
3. **3D/画像ファイル** を選択（`.glb` 推奨）
4. 「ファイルをアップロード」を実行
5. 必要なら **active** に切替
6. `/monitoring-3d-v2?siteId=...` で GLB/GLTF mesh 表示を確認
7. transform（キャリブレーション）で位置合わせ

### API

```http
POST /api/monitoring/v1/map-assets/upload
Content-Type: application/json

{
  "siteId": "DEMO-HOME-001",
  "title": "Polycam 1F",
  "sourceType": "polycam",
  "floorLevel": "1f",
  "mapType": "mesh",
  "fileName": "scan-1f.glb",
  "fileBase64": "...",
  "mimeType": "model/gltf-binary",
  "setActive": true
}
```

---

## 静的ファイル URL

- 配信: `/uploads/monitoring/{siteId}/{safeFileName}`
- **Customer UI には内部パスを出さない**（Monitoring 管理画面 · 3D Dashboard のみ）

---

## 表示できない形式の扱い

| fileType | 保存 | 3D Dashboard | Manager プレビュー |
|----------|------|--------------|-------------------|
| glb / gltf | ○ | GLTFLoader 表示 | 簡易 3D preview |
| obj | ○ | OBJLoader 表示（material なし時は標準材質） | OBJ 3D preview |
| ply | ○ | PLYLoader 表示（mesh/点群） | PLY 3D preview |
| usdz | ○ | 「プレビュー準備中」+ GLB 変換案内 | GLB 変換推奨表示 |
| jpg / png | ○ | — | img preview |
| json | ○ | placeholder | placeholder |

---

## フロア分割（floorLevel）

| floorLevel | 用途 |
|------------|------|
| `perimeter` | 外周 · 門扉 · 駐車場 · フェンス |
| `1f` | 1階室内 |
| `2f` | 2階室内 |
| `roof` | 屋上（任意） |

**原則:** 1F / 2F / 外周を **別 mapAsset として登録**。

**V3.3 複数フロア合成:** 3D Dashboard で `全フロア合成` モードにより perimeter / 1f / 2f を同時表示。`floorHeightOffsets` で 2F を高さ方向にずらす。Manager の `visibleInDashboard` でレイヤー ON/OFF。

---

## USDZ 変換方針

- **RoomPlan / iPhone LiDAR** の USDZ は TiSLY 3D Dashboard では直接プレビュー不可
- **推奨:** Polycam / Reality Converter / Blender で **GLB に変換**してからアップロード
- Manager UI に「GLB 変換推奨」バッジを表示

---

## センサー位置合わせ手順（V3.3）

1. `/monitoring-3d-v2?siteId=...` を開く
2. 左パネル「センサー位置合わせ」で **編集モード ON**
3. センサーを選択 · X/Y/Z 入力または ± ボタンで微調整
4. **プレビュー** で 3D 上に反映確認
5. **保存** → `device-layout-overrides.json` に永続化
6. リロード後も座標維持

---

## DEMO-FACTORY-001 構成

| エリア | センサー | deviceType |
|--------|----------|------------|
| 骨材ヤード | aggregateYard | yardSensor |
| 出荷ゲート | shippingGate | gate |
| サイロ | silo01 | silo |
| ミキサー | mixer01 | mixer |
| コンベア | conveyor01 | conveyor |
| 水タンク | waterTank | tank |
| 送水ポンプ | pump01 | pump |
| 計量スケール | scale01 | scale |
| 操作室 | controlRoom | panel |

- URL: `/monitoring-3d-v2?siteId=DEMO-FACTORY-001`
- mapAsset seed: 外周 OBJ · 1F GLB · 2F PLY placeholder

---

## transform / キャリブレーション

| 項目 | 説明 |
|------|------|
| `position.x/y/z` | ワールド座標オフセット |
| `rotation.x/y/z` | 回転（度） |
| `scale.x/y/z` | スケール |
| `heightOffset` | 高さオフセット（Y 加算） |

---

## センサー位置合わせ（device-layout-overrides）

- 保存先: `server/data/monitoring/device-layout-overrides.json`
- API: `GET/POST /api/monitoring/v1/device-layout-overrides`
- V3.3: 3D Dashboard 左パネル — 編集モード · ± 微調整 · 保存

---

## QNAP 保存の将来構成

| mode | 説明 |
|------|------|
| `local`（現行） | `server/uploads/monitoring/{siteId}/` — `saveLocalAsset()` |
| `qnap-webdav`（mock） | `saveQnapAssetMock()` — 本接続 TODO |
| `mock` | メタデータのみ（テスト用） |

API レスポンスに `backupStatus`（`getBackupStatus()`）を含む。

環境変数: `TISLY_MONITORING_MAP_ASSET_STORAGE=local|qnap-webdav|mock`  
Adapter: `server/src/monitoring/monitoring-map-asset-storage-adapter-v1.ts`

---

## API 一覧

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/monitoring/v1/map-assets?siteId=` | 一覧 · active · uploadGuide · backupStatus |
| POST | `/api/monitoring/v1/map-assets` | メタデータのみ登録 |
| **POST** | **`/api/monitoring/v1/map-assets/upload`** | **実ファイルアップロード + 登録** |
| PATCH | `/api/monitoring/v1/map-assets/:assetId` | transform · active · visibleInDashboard |
| **DELETE** | **`/api/monitoring/v1/map-assets/:assetId`** | **削除（`?deleteFile=true` で物理ファイルも）** |
| POST | `/api/monitoring/v1/map-assets/reset-transforms` | transform 一括リセット |
| GET | `/api/monitoring/v1/device-layout-overrides?siteId=` | センサー座標 |
| POST | `/api/monitoring/v1/device-layout-overrides` | 座標保存 |

---

## セキュリティ

- 許可拡張子のみ（`.glb` `.gltf` `.obj` `.ply` `.usdz` `.json` `.jpg` `.png`）
- siteId / ファイル名 sanitize · パス traversal 対策
- JSON レスポンスに絶対パス非公開 · stack trace 非公開

---

## 確認 URL

- https://tisly.jp/monitoring-map-assets-v1?siteId=DEMO-HOME-001
- https://tisly.jp/monitoring-map-assets-v1?siteId=DEMO-FACTORY-001
- https://tisly.jp/monitoring-3d-v2?siteId=DEMO-HOME-001
- https://tisly.jp/monitoring-3d-v2?siteId=DEMO-FACTORY-001
- https://tisly.jp/api/monitoring/v1/map-assets?siteId=DEMO-HOME-001

---

## 残課題（V3.3 以降）

- Three.js CDN 依存解消（バンドル化）
- QNAP WebDAV 本接続
- センサーの 3D 平面ドラッグ
- USDZ ネイティブプレビュー
- asset 透明度 UI スライダー
