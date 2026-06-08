# 次に自走できる作業

## ブロック中

- [ ] VPS デプロイ後 iPhone Safari で現調写真・日程詳細の実機確認
- [ ] 本番 `/api/health` commitShort 更新確認

## すぐ着手可能

- [ ] **検索PWA** — `search_index_json` を使った横断検索 UI
- [ ] Google Calendar OAuth 本接続（キー取得後）
- [ ] Google Maps Distance Matrix 本接続（キー取得後）
- [ ] Open-Meteo `OPEN_METEO_LIVE=1` 本番有効化
- [ ] 現調PWA — 写真・部材の個別削除
- [ ] 現調PWA — オフライン下書き
- [ ] Puppeteer 本番 PDF（HTML→PDF）
- [ ] 阿見リフォーム見積サンプルデータのシード投入

## テスト

```bash
cd server
npm run build
npx tsx --test test/schedule-v1.test.ts
npx tsx --test test/survey-v1.test.ts
npx tsx --test test/estimate-v1.test.ts
npx tsx --test test/multi-pwa-app-hub.test.ts
```
