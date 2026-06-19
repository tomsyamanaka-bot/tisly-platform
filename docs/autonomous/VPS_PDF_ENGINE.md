# VPS Puppeteer PDF Engine

**最終更新:** 2026-06-19

## 症状

`GET https://tisly.jp/api/health` で `pdfEngine: "html_fallback"` になる。

## 原因（調査結果）

| チェック | 内容 |
|----------|------|
| `TISLY_PDF_PUPPETEER` | `false` の場合は意図的に HTML fallback |
| `node_modules/puppeteer` | 未インストール → fallback |
| Chromium 実行ファイル | VPS に `/usr/bin/chromium` 等が無い → `pdfLastError: Chromium executable not found` |
| プローブ失敗 | 起動・PDF生成・検証のいずれかで例外 → fallback（本番 PDF は `renderWithPdfFallback` で継続） |

health エンドポイントは起動時に `probePdfEngineHealth()` を実行し、結果を `pdfEngine` / `pdfEngineReady` / `pdfLastError` に反映します。

## 本番での安全な復旧手順

1. VPS に SSH ログイン
2. プロジェクトディレクトリで依存確認:
   ```bash
   npm ls puppeteer chromium
   ```
3. Chromium を OS パッケージまたは `chromium` npm パッケージでインストール
4. `.env` に設定:
   ```env
   TISLY_PDF_PUPPETEER=true
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   ```
   （実際のパスは `which chromium` で確認）
5. サービス再起動後、health 確認:
   ```bash
   curl -s https://tisly.jp/api/health | jq '.pdfEngine, .pdfEngineReady, .pdfLastError'
   ```
6. `pdfEngine: "puppeteer"` かつ `pdfEngineReady: true` になること

## 注意

- Puppeteer 復旧中も **HTML minimal PDF は生成可能**（レイアウトは簡略版）
- 復旧作業中は **本番で大量 PDF 再生成を避ける**
- コード参照: `server/src/business/pdf/pdf-engine-status.ts`, `chromium-path.ts`

## 今回の方針（2026-06-19）

仕様書 PDF v2 実務ロックを優先し、VPS 上の Puppeteer 復旧は上記手順をドキュメント化のみ。`html_fallback` のままでも現場 PDF 生成は継続可能。
