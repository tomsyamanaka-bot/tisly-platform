# Gemini Vision 作図移行手順書

**完了日:** 2026-07-12  
**画面:** `/survey-drawing-v1`  
**本番デプロイ:** `77ff71f7`（`commitShort`: `77ff71f`）  
**確認URL:** https://tisly.jp/api/health  
**ステータス:** 完全終了（クローズ）

---

## 1. 社長向けサマリ（完了報告）

OpenCV／Canny による端末内線検出を
完全撤去した。

代わりに Gemini Vision API が
壁輪郭 SVG を生成する。

フロントは DOMParser で安全に
最背面レイヤーへマウントする。

`aiWallSvg` は layers に永続化し、
再読込でも背景として復元される。

ビルド・関連テスト 17 件パス、
本番 `77ff71f` 反映済み。

本タスクは完全終了とする。

---

## 2. 移行の目的

| 項目 | 旧（撤廃） | 新（採用） |
|------|------------|------------|
| 壁抽出 | OpenCV / Canny / 適応2値化 | Gemini Vision → SVG |
| フロント | `detectSketchLinesFromBlobV1` 等 | FormData → API → `aiWallSvg` |
| 描画 | `paths` への自動線投入 | 専用背景レイヤー |
| 安全 | 生 HTML 挿入リスク | DOMParser + 危険ノード除去 |
| 永続化 | 自動線 paths 依存 | `layers.aiWallSvg` |

狙い:

- 方眼紙・影・解像度差に弱い
  画像処理依存を断つ
- 壁は編集不可の背景 SVG
- 手書き・記号・通線は従来どおり
  前面レイヤーで編集

---

## 3. 新アーキテクチャ

```
[写真アップロード]
       │
       ▼
POST /api/survey/v1/drawing-sketches/:id/auto-draw-lines
       │
       ▼
survey-sketch-ai-svg-v1
  ├─ provider: gemini | mock（auto 解決）
  ├─ GeminiSurveySketchAiSvgProviderV1
  └─ sanitizeAiWallSvgResponseV1
       │
       ▼
normalizeAiWallSvgV1 → layers.aiWallSvg
       │
       ▼
フロント applyAiWallSvgFromApi
  └─ mountSafeAiWallSvgV1（DOMParser）
       │
       ▼
#survey-ai-wall-svg-layer（最背面）
  写真層の直後 / drawing-svg の直前
```

### レイヤー順（下→上）

1. 方眼紙・背景写真
2. **AI 壁 SVG**（`survey-ai-wall-svg-layer`）
3. 手書き paths / 記号 / メモ（`drawing-svg`）

### データモデル

`SurveyDrawingLayersV2.aiWallSvg`:

- `markup` … サニタイズ済み `<svg>…</svg>`
- `viewBox` / `width` / `height`
- `provider` / `updatedAt`

旧 OpenCV 由来の `paths` は
読込・適用時に破棄する。

---

## 4. 主要ファイル

| 領域 | パス |
|------|------|
| API | `server/src/api/routes/survey-v1.ts` |
| Vision エントリ | `server/src/survey/survey-sketch-ai-svg-v1.ts` |
| Gemini プロバイダ | `server/src/survey/survey-sketch-ai-svg-gemini-provider.ts` |
| サニタイズ | `server/src/survey/survey-sketch-ai-svg-sanitize.ts` |
| 型・正規化 | `server/src/survey/survey-drawing-v1-types.ts` |
| Store PATCH | `server/src/survey/survey-drawing-v1-store.ts` |
| フロント本体 | `server/public/js/survey-drawing-v1.js` |
| 壁 SVG UI | `server/public/js/features/drawing/survey-ai-wall-svg-v1.js` |
| 自動作図橋渡し | `server/public/js/features/drawing/survey-sketch-auto-draw-v1.js` |
| テスト | `server/test/survey-sketch-ai-svg-v1.test.ts` |
| | `server/test/survey-ai-wall-svg-frontend-v1.test.ts` |

### 環境変数

| 変数 | 意味 |
|------|------|
| `GEMINI_API_KEY` | Vision API キー |
| `GEMINI_SKETCH_MODEL` | 既定 `gemini-3.6-flash` |
| `SURVEY_SKETCH_AI_SVG_PROVIDER` | `auto` / `mock` / `gemini` |

`auto`: キー有り → gemini、無し → mock。

---

## 5. Phase 対応（フロント 3〜5）

| Phase | 内容 | 状態 |
|-------|------|------|
| 1〜2 | サーバ Gemini SVG 経路・サニタイズ | ✅ |
| 3 | `aiWallSvg` 型・正規化・migrate | ✅ |
| 4 | DOMParser 安全マウント・最背面 | ✅ |
| 5 | PATCH 永続化・再読込復元・旧ロジック撤去 | ✅ |

UI バージョンマーカー例:

- `survey-drawing-ui-v37`
- SW: `tisly-pwa-v2415-phase50`
- `survey-ai-wall-svg-v1.js` をキャッシュ対象に含む

---

## 6. フロント実装要点

### 安全マウント（`mountSafeAiWallSvgV1`）

- `DOMParser` + `image/svg+xml`
- `parsererror` 時は非表示
- `script` / `foreignObject` / `iframe` 等を除去
- イベント属性・外部参照を除去

### 旧ロジック撤去

- クライアント Canny /
  `detectSketchLinesFromBlobV1` 削除
- `lineDetect.paths` は無視
- OpenCV 由来 paths を破棄

### 自動作図フロー

1. 写真取得 → FormData
2. `auto-draw-lines` 呼び出し
3. 応答の `aiWallSvg` のみ採用
4. レイヤー描画 + 必要に応じ PATCH

---

## 7. 検証結果（クローズ時）

| 項目 | 結果 |
|------|------|
| `npm run build` | 成功 |
| 関連テスト | 17 件パス |
| ローカル `/api/health` | 確認済み |
| 本番 `commitShort` | `77ff71f` |

主要コミット:

- `4196980c` — Gemini Vision wall-SVG 経路
- `77ff71f7` — FE 背景描画・旧画像処理撤廃

---

## 8. 次回開発への注意

1. 壁線の編集は `aiWallSvg` 再生成が基本。
   手書き paths に戻さない。
2. 仕様書 PDF の写真は
   `survey_photos` のみ（混在禁止）。
3. mock プロバイダはキー無し開発用。
   本番は `GEMINI_API_KEY` 必須。
4. サニタイズを緩めてはいけない
   （XSS 防止の境界）。
5. 関連回帰は
   `docs/autonomous/checklists/REGRESSION_TEST.md`
   （写真・PDF・日程）を参照。

---

## 9. 関連ドキュメント

- [SURVEY_DRAWING_PERFECT_FIX.md](./SURVEY_DRAWING_PERFECT_FIX.md)
  … 消しゴム／写真／Hit Testing 等の前日締め
- [autonomous/SURVEY_DRAWING_V1.md](./autonomous/SURVEY_DRAWING_V1.md)
  … 図面 v1/v2 仕様
- [autonomous/PROJECT_STATUS.md](./autonomous/PROJECT_STATUS.md)
  … 完成仕様の単一ソース

---

**最終到達コミット:** `77ff71f7`  
**タスク状態:** Gemini 全面移行 — 完全終了（クローズ）
