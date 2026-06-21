# TiSLY Monitoring mapAsset ガイド（V3.2）

**対象:** 開発者 · 現調担当 · 3Dスキャン取り込み担当  
**関連画面:** `/monitoring-map-assets-v1` · `/monitoring-3d-v2`  
**メタデータ:** `server/data/monitoring/map-assets.json`  
**実ファイル:** `server/uploads/monitoring/{siteId}/`

---

## 目的

Polycam / RoomPlan / Scaniverse などから出力した 3D データを TiSLY 監視画面（Three.js）に載せる **実ファイルアップロード + GLB/GLTF 表示** 入口。

V3.2 時点で **GLB/GLTF は Three.js GLTFLoader で表示可能**。OBJ/PLY/USDZ は登録・保存のみ（placeholder fallback）。

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
| jpg / png | ○ | — | img preview |
| obj / ply / usdz | ○ | placeholder + メッセージ | placeholder |
| json | ○ | placeholder | placeholder |

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

---

## QNAP 保存の将来構成

| mode | 説明 |
|------|------|
| `local`（現行） | `server/uploads/monitoring/{siteId}/` |
| `qnap-webdav`（TODO） | `\\192.168.1.10\TiSLY\monitoring\{siteId}\` |
| `mock` | メタデータのみ（テスト用） |

環境変数: `TISLY_MONITORING_MAP_ASSET_STORAGE=local|qnap-webdav|mock`  
Adapter: `server/src/monitoring/monitoring-map-asset-storage-adapter-v1.ts`

---

## API 一覧

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/monitoring/v1/map-assets?siteId=` | 一覧 · active · uploadGuide · storageMode |
| POST | `/api/monitoring/v1/map-assets` | メタデータのみ登録 |
| **POST** | **`/api/monitoring/v1/map-assets/upload`** | **実ファイルアップロード + 登録** |
| PATCH | `/api/monitoring/v1/map-assets/:assetId` | transform · active 切替 |
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
- https://tisly.jp/monitoring-3d-v2?siteId=DEMO-HOME-001
- https://tisly.jp/api/monitoring/v1/map-assets?siteId=DEMO-HOME-001

---

## 残課題（V3.2 以降）

- OBJLoader / PLYLoader / USDZ 対応
- Three.js CDN 依存解消（バンドル化）
- QNAP WebDAV 本接続
- センサーのドラッグ操作
- 工場/施設レイアウト
