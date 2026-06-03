# Puppeteer PDF 回帰（Phase 781–820）

## モード

| `TISLY_PDF_PUPPETEER` | 動作 |
|-----------------------|------|
| 未設定 / false | HTML → minimal PDF フォールバック（CI 常時 pass） |
| true | puppeteer PDF（optional dependency） |

## 回帰

- SHA256 スナップショット: `server/test/fixtures/pdf-snapshots/*.hash`
- 任意: `pixelmatch` + `pngjs` がインストールされていればピクセル比較（threshold 既定 0.02）

## テスト

- `server/test/business-phase781.test.ts` — `comparePdfSnapshot`

## 実装

- `server/src/business/pdf/regression-snapshot.ts`
- `server/src/business/pdf/render.ts`
