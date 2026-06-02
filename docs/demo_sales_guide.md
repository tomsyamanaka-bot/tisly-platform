# TiSLY 営業デモ手順（Phase 61–80）

## 起動

```bash
# リポジトリルート
npm run demo

# または server のみ
cd server && npm run demo
```

- URL: http://localhost:3080/
- 運用コンソール: http://localhost:3080/operations
- TV WebSocket プレビュー: http://localhost:3080/tv
- Google TV: `cd tv-app && EXPO_PUBLIC_API_URL=http://<PC-IP>:3080 npx expo start`

## デモの見せ方（5分）

1. **ダッシュボード** — 現場数・機器・異常・イベントが動いていることを示す
2. **運用コンソール** — マップ / デバイス / Alarm Center / Health（すべて実機なしで更新）
3. **即時イベント** — 「即時イベント」で TV・PWA に警報が飛ぶ
4. **TV** — 赤画面・点滅・警報表示（`/tv` または tv-app）
5. **PWA** — スマホで Push 登録 → 通知センターで検索・既読

## 仮想現場

| ID | 名称 |
|----|------|
| site-moriya | 守谷住宅 |
| site-factory-a | 工場A |
| site-warehouse-a | 倉庫A |
| site-minpaku-a | 民泊A |
| site-garage-a | 車屋A |

30秒毎に人感・窓開・侵入・温度・heartbeat・復旧などを自動生成。

## API（参考）

| メソッド | パス |
|----------|------|
| GET | `/api/demo/status` |
| POST | `/api/demo/start` / `stop` / `trigger` / `seed` |
| GET | `/api/demo/map`, `devices`, `alarms`, `analytics`, `health`, `replay` |
