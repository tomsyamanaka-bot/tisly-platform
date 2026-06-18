# 現調図面 AI 清書パイプライン v1 — 設計書

**最終更新:** 2026-06-18  
**前提:** 現調図面 v2（`schemaVersion: 2`）が完成済み  
**関連:** [SURVEY_DRAWING_V1.md](./SURVEY_DRAWING_V1.md)

---

## 目的

方眼紙写真・手書き図面から、AI 清書を経て CAD 風配線図・材料拾い・帳票類へ自動連携する将来フローを定義する。

```
方眼紙写真 / 手書き図面
        ↓
  現調図面 PWA（v2）
  背景 + 線 + 記号 + メモ
        ↓
  AI清書用 JSON（ダウンロード / 将来 API）
        ↓
  AI 清書エンジン（未接続）
        ↓
  CAD風図面 + 構造化データ
        ↓
  配線図 / 材料拾い / 仕様書 / 見積 / 完了報告
```

---

## 入力

### 1. 手書き図面（画像）

| 項目 | 内容 |
|------|------|
| 形式 | JPEG / PNG（方眼紙写真） |
| 保存先 | `uploads/survey/{projectId}/drawings/` |
| DB | `survey_drawing_sketches.background_image_path` |
| v2 フィールド | `backgroundImage.path`, `backgroundImage.url`, `canvas.width/height` |

### 2. 現調図面 JSON（v2）

エンドポイント: `GET /api/survey/v1/drawing-sketches/:sketchId/ai-export`

| フィールド | 説明 |
|-----------|------|
| `schemaVersion` | `2`（将来互換の正規バージョン） |
| `drawingVersion` | `2` |
| `projectId` | 現調案件 ID（`SVY-…`） |
| `sketchId` | 図面スケッチ UUID |
| `canvas` | `{ width, height }` ピクセル座標系 |
| `backgroundImage` | 背景画像メタ（path, url, width, height） |
| `viewport` | `{ scale, offsetX, offsetY }` 表示倍率 |
| `paths` | 線・配線ルート（`lineType`, `points`, `lengthPx`） |
| `symbols` | 設備記号（種別, 座標, 回転, メモ） |
| `notes` | テキストメモ |
| `sketchNotes` | 図面全体メモ |

### 線種（`lineType`）

| ID | 用途 | 色 |
|----|------|-----|
| `lan` | LAN 配線 | 青 |
| `power100v` | 100V 電源 | 赤 |
| `power24v` | 24V 電源 | 黄 |
| `rs485` | RS485 | 紫（破線） |
| `coax` | 同軸 | グレー |
| `phone` | 電話 | 緑（破線） |
| `generic` | 一般 | 任意 |

### 設備記号（`symbolType`）

ドームカメラ / バレットカメラ / 人感センサー / ビームセンサー / マグネット / スピーカー / LAN / AP / モニター / NVR / ルーター / スイッチ / コンセント / 照明 / 分電盤 / 電源 / 制御盤（SVG 定義済み）

---

## 出力（将来）

### 1. 配線図（CAD 風）

- 入力 JSON + 背景画像から AI が線を整流・スナップ
- 出力: SVG / DXF / PDF（レイヤー分離）
- 座標系: `canvas` ピクセル → 実寸スケール（将来 `scaleMmPerPx` フィールド追加予定）

### 2. 材料拾い

| 入力 | 出力 |
|------|------|
| `symbols`（カメラ台数等） | `survey_materials` 候補行 |
| `paths`（`lineType`, `lengthPx`） | ケーブル種別・延長メートル換算 |
| 記号メモ | 設置場所テキスト |

### 3. 仕様書 PDF

- 既存 `specification-template.ts` へ機器一覧・配置図サムネイルを注入
- **現調写真（`survey_photos`）とは分離** — 図面は別セクション

### 4. 見積

- 材料拾い結果 → `estimate_items` ドラフト
- **v1 準備完了:** `GET /api/master/v1/estimate-preview` — 作業/材料候補抽出（[MASTER_V1.md](./MASTER_V1.md)）
- 記号マッピング: `master_v1_symbol_mappings`（カメラ→カメラ設置、LAN→LAN配線 等）
- 顧客別単価ルール v1.2 を適用

### 5. 完了報告

- 施工後写真（`completion_photos`）+ 清書図面の差分ハイライト

---

## パイプライン段階（実装ロードマップ）

| Phase | 内容 | 状態 |
|-------|------|------|
| v2 データ構造 | `schemaVersion: 2`, paths/symbols/notes | ✅ 完了 |
| 設備記号ライブラリ v1 | SVG 17種 + ドラッグ/回転/削除 | ✅ 完了 |
| 配線ルート強化 | 線種 6 + 距離 `lengthPx` | ✅ 完了 |
| AI JSON エクスポート | ダウンロードボタン | ✅ 完了 |
| AI 清書 API 接続 | 外部 LLM / Vision 送信 | 🔲 次フェーズ |
| 実寸スケール | 方眼紙グリッド認識 | 🔲 将来 |
| 見積自動反映 | symbols → materials | 🔲 将来 |
| QNAP 図面バックアップ | PDF/JSON 同期 | 🔲 将来 |

---

## API 設計（将来）

```
POST /api/survey/v1/drawing-sketches/:sketchId/ai-clean
  → { jobId, status: "queued" }

GET /api/survey/v1/drawing-sketches/:sketchId/ai-clean/:jobId
  → { status, resultSvg?, resultJson?, error? }
```

**認証:** 既存 `surveyV1Auth`（現調担当ロール）  
**送信データ:** `ai-export` と同一 JSON + 背景画像 Base64（オプション）  
**レスポンス:** 清書 SVG + 構造化ノード（機器・配線グラフ）

---

## 座標・倍率の扱い

| 概念 | フィールド | 説明 |
|------|-----------|------|
| キャンバスサイズ | `canvas.width/height` | 背景画像の自然サイズ（px） |
| 描画座標 | `paths[].points`, `symbols.x/y` | キャンバス左上原点 |
| 表示倍率 | `viewport.scale` | UI ズーム（AI 入力時は `1` に正規化推奨） |
| パンオフセット | `viewport.offsetX/Y` | 表示のみ（AI には無視） |
| 距離 | `paths[].lengthPx` | ピクセル延長（実寸換算は将来） |

---

## 壊してはいけないルール

1. **現調写真と完了報告写真の分離** — 図面 JSON はどちらにも混在しない
2. **v1 データの後方互換** — `migrateLayersToV2()` で読み込み時自動変換
3. **schemaVersion 固定** — AI パイプラインは `schemaVersion` で分岐
4. **ローカル正** — 図面 JSON の正は DB + uploads、QNAP はバックアップのみ（将来）

---

## コード参照

| 領域 | パス |
|------|------|
| 型・記号・線種 | `server/src/survey/survey-drawing-v1-types.ts` |
| Store・AI エクスポート | `server/src/survey/survey-drawing-v1-store.ts` |
| API | `server/src/api/routes/survey-v1.ts` |
| UI | `server/public/survey-drawing-v1.html`, `js/survey-drawing-v1.js` |
| テスト | `server/test/survey-drawing-v1.test.ts` |

---

## 次フェーズ候補

1. **AI 清書 API プロトタイプ** — OpenAI Vision / Claude で背景+JSON 送信
2. **方眼紙スケール推定** — グリッド検出 → `mmPerPx`
3. **見積連動** — `dome_camera` × N → カメラ部材テンプレ
4. **図面 PDF 出力** — 清書結果を案件 PDF 保存 v1 へ
