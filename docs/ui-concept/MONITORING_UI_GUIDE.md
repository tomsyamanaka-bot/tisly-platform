# TiSLY Monitoring UI 標準ガイド

**コンセプト:** TiSLY Security Command Center  
**参考:** SECOM / ALSOK / 空港管制室 / 防災センター / SOC監視室  
**対象 URL:** `/tisly-monitoring-3d-v1` · `/tisly-monitoring-home-v1` · `/tisly-monitoring-plant-v1` · `/monitoring-3d-v2` · `/monitoring-map-assets-v1` · `?mode=tv`

---

## 色（Color Palette）

| 用途 | CSS変数 | 値 | 説明 |
|------|---------|-----|------|
| 背景 | `--mon-bg` | `#050b18` | 最深ネイビー |
| パネル | `--mon-panel` | `#0a1224` | サイド/ログ背景 |
| ガラス | `--mon-glass` | `rgba(15,23,42,0.72)` | カード半透明 |
| 枠線 | `--mon-border` | `#1e3a5f` | 青系ボーダー |
| アクセント | `--mon-cyan` | `#22d3ee` | タイトル・時計・正常系 |
| プライマリ | `--mon-blue-deep` | `#2563eb` | ボタン |
| 侵入 | `--mon-red-deep` | `#dc2626` | 最高優先度 |
| 警報 | `--mon-orange` | `#fb923c` | 中優先度 |
| 注意 | `--mon-yellow` | `#fbbf24` | 低警報 |
| 情報 | `--mon-blue` | `#38bdf8` | 通常イベント |
| 正常 | `--mon-green` | `#34d399` | センサー正常 |

---

## カード（Cards）

- **角丸:** `12px`（`--mon-radius`）
- **背景:** ガラスモーフィズム + `backdrop-filter: blur(12px)`
- **枠:** `1px solid var(--mon-border)`
- **影:** 建物カード `--mon-shadow-building`、発報時 `--mon-alarm-glow`
- **右パネル構成:** 現在警報 → ライブカメラ → センサー状態 → 警戒状態 → 集計

---

## 警報表現（Alert Expression）

### 優先度（ログ・バッジ共通）

| 優先度 | 日本語 | 行背景 | 左ボーダー |
|--------|--------|--------|------------|
| 侵入 | 侵入警報 | 深赤 `#7f1d1d` 系 | `#dc2626` |
| 警報 | 警報 | オレンジ `#7c2d12` 系 | `#fb923c` |
| 注意 | 注意 | 黄 `#713f12` 系 | `#fbbf24` |
| 情報 | 情報 | ネイビー | `#38bdf8` |

### 発報演出

1. **画面上部バー** — 🚨 + レベル + 場所 + 時刻（固定・パルス）
2. **フロア拡大** — `.is-alert` で `scale(1.02)` + 赤枠点滅
3. **赤リング波紋** — 発報ピン位置に `.mon3d-alert-ring` ×3
4. **ピン点滅** — `.is-blink` + `--mon-alarm-glow`
5. **カメラ枠連動** — `.is-alert-linked` 赤枠

---

## ボタン（Buttons）

| 種別 | クラス | 用途 |
|------|--------|------|
| プライマリ | `.mon3d-btn` | 更新・対応・テスト |
| セカンダリ | `.mon3d-btn.secondary` | TV表示・ログ |
| 危険 | `.mon3d-btn.danger` | 対応済みにする |
| ゴースト | `.mon3d-btn.ghost` | 資料リンク |

- **角丸:** `8px`
- **ホバー:** 軽い浮き上がり + ネオングロー

---

## フォント（Typography）

- **ファミリー:** `"Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif`
- **ブランド:** 800 weight · シアン · letter-spacing 0.06em
- **セクション見出し:** 0.82rem · uppercase · 紫 `--mon-purple`
- **時計:** tabular-nums · シアン
- **TVモード:** ベース 1.15rem · タイトル 2rem · バナー 1.5rem

---

## 余白（Spacing）

| 要素 | 値 |
|------|-----|
| メイン padding | `1rem 1.25rem 2rem` |
| カード内 padding | `0.9rem` |
| フロアスタック gap | `1.25rem` |
| 右パネル gap | `0.85rem` |
| グリッド gap | `1rem` |
| モバイル下部ナビ | `4.5rem + safe-area` |

---

## 3Dマップ（Floor Scene）

### 戸建てデモ — フロア識別

| フロア | 視覚要素 |
|--------|----------|
| 外周 | フェンス · 庭 · 駐車場 · 建物影 · 玄関通路 · 勝手口 |
| 1階 | 間取り · リビング/ホール/玄関/勝手口 · ガラス · 照明グロー |
| 2階 | 寝室 · ホール · 階段 · ガラス |
| 屋根 | 屋根フットプリント |

- **perspective:** `1100px` · **rotateX:** `14deg`
- **発光:** `.mon3d-glow-light` パルスアニメーション

---

## 表示モード

| モード | 条件 | 要点 |
|--------|------|------|
| PC | デフォルト | 左ナビ + 中央マップ + 右パネル + 下ログ |
| モバイル | `<768px` | 下部4タブナビ |
| TV | `?mode=tv` | 大文字 · 大マップ · 警報最優先 · ログ右下固定 |

---

## ファイル参照

| ファイル | 役割 |
|----------|------|
| `server/public/tisly-monitoring-3d-v1.html` | シェル |
| `server/public/css/tisly-monitoring-3d-v1.css` | V2 スタイル |
| `server/public/js/tisly-monitoring-3d-v1.js` | 描画・API |
| `server/src/monitoring/tisly-monitoring-layout-v1.ts` | 配置データ |

---

## mapAsset V3.3（OBJ/PLY · 複数フロア · センサー合わせ）

| 画面 | パス |
|------|------|
| mapAsset Manager | `/monitoring-map-assets-v1?siteId=DEMO-HOME-001` |
| 3D Dashboard | `/monitoring-3d-v2?siteId=DEMO-HOME-001` |
| 工場デモ | `/monitoring-3d-v2?siteId=DEMO-FACTORY-001` |

### V3.3 追加要素

- **OBJ/PLY:** `OBJLoader` / `PLYLoader` — Scaniverse 出力対応
- **USDZ:** 登録可 · Dashboard「プレビュー準備中」· Manager「GLB 変換推奨」
- **複数フロア合成:** active のみ / 全フロア / 外周 / 1F / 2F — `visibleInDashboard` で ON/OFF
- **センサー位置合わせ:** 編集モード · X/Y/Z ± 微調整 · device-layout-overrides 保存
- **Manager V3.3:** floorLevel タブ · 削除 · transform 一括リセット · OBJ/PLY バッジ
- **DEMO-FACTORY-001:** サイロ/コンベア/ミキサー/水タンク/出荷ゲート/操作室 seed
- **backupStatus:** API レスポンスに QNAP adapter 状態

### V3.2 要素（維持）

- **ファイルアップロード:** GLB/GLTF/OBJ/PLY/USDZ/JSON/JPG/PNG — 進行表示 · トースト
- **GLB/GLTF:** Three.js `GLTFLoader` で mesh 表示
- **保存:** `server/uploads/monitoring/{siteId}/` — `/uploads/monitoring/...` で配信

### placeholder mesh 色（sourceType）

| sourceType | 色 | 用途 |
|------------|-----|------|
| polycam | `#22c55e` | GLB mesh 想定 |
| roomplan | `#a855f7` | JSON/USDZ 想定 |
| scaniverse | `#0ea5e9` | GLB/OBJ 想定 |
| manual | `#fbbf24` | 手動登録 |
| mock | `#64748b` | デモ |

- **fileUrl 未接続 / 未対応形式:** wireframe placeholder + ラベルスプライト
- **プロシージャル box:** 登録 scan の下に重ねて表示
- **詳細:** [docs/monitoring/MAP_ASSET_GUIDE.md](../monitoring/MAP_ASSET_GUIDE.md)

### V3.4 資料連携（device attachment · 写真ピン）

| 画面 | パス |
|------|------|
| 3D Dashboard V3.4 | `/monitoring-3d-v2?siteId=DEMO-HOME-001` |
| device attachments API | `GET /api/monitoring/v1/device-attachments?siteId=&deviceId=` |
| 完了報告スロット | `GET/POST /api/monitoring/v1/report-photo-slots` |

- **右パネル 4 タブ:** 状態 · カメラ · **資料** · ログ
- **資料タブ:** 現調/施工前後/配線写真 · 仕様書/完了報告 PDF · Customer 説明 · 完了報告候補追加
- **3D 写真ピン:** 📷 — 青=customer · 緑=report · 灰=内部
- **Customer 連携:** 案件ページ · Site Map · お客様向け説明 · 関連資料
- **詳細:** [DEVICE_ATTACHMENT_GUIDE.md](../monitoring/DEVICE_ATTACHMENT_GUIDE.md)

---

## 今後の TiSLY UI への適用

- ダーク系監視画面は本ガイドの色・警報表現を優先
- お客様向け（Customer UI）は明るい背景のまま — 混在しない
- 機能追加より **視認性・発報の一瞬理解** を最優先
