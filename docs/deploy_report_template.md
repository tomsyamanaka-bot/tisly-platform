# TiSLY デプロイレポート

**公開後に記録するテンプレート（Phase 1441–1460）**

---

## 基本情報

| 項目 | 値 |
|------|-----|
| デプロイ日時 | YYYY-MM-DD HH:MM JST |
| 担当者 | |
| 対象環境 | ConoHa VPS / tisly.jp |
| ビルドラベル | TiSLY RC2 |
| ビルド番号 | RC2-1460 |
| コミットハッシュ | |
| Release Gate | PASS / FAIL |
| Deploy Dry Run | PASS / FAIL |

---

## 事前チェック

- [ ] `docs/preflight_checklist.md` 全項目確認
- [ ] `GET /api/deploy/preflight` — `missing: []`
- [ ] `/app` VPS Deploy Status — **READY FOR DEPLOY**

---

## デプロイ手順（実施記録）

| 手順 | コマンド / 操作 | 結果 | 時刻 |
|------|-----------------|------|------|
| 1 | `git pull` | OK / NG | |
| 2 | `npm ci` | OK / NG | |
| 3 | `npm run release:gate` | OK / NG | |
| 4 | `.env` 配置・確認 | OK / NG | |
| 5 | `npm run build` | OK / NG | |
| 6 | `systemctl restart tisly-server` | OK / NG | |
| 7 | `nginx -t && systemctl reload nginx` | OK / NG | |

---

## 公開後ヘルス

### `GET /api/health`

```json
{
  "status": "",
  "buildVersion": {},
  "uptime": 0,
  "database": {},
  "websocket": {},
  "productionUrl": ""
}
```

| 項目 | 期待値 | 実測 |
|------|--------|------|
| status | ok | |
| database.status | ok | |
| websocket.status | ok | |
| productionUrl | https://tisly.jp | |
| uptime | > 0 | |

---

## ルート確認

| ルート | URL | 結果 | 備考 |
|--------|-----|------|------|
| App Hub | /app | OK / NG | |
| Survey | /survey | OK / NG | |
| Business | /business | OK / NG | |
| Installer | /installer | OK / NG | |
| Customer | /customer | OK / NG | |
| Pro Remote | /pro-remote | OK / NG | |
| TV | /tv/TOMS001 | OK / NG | |

---

## mock / real 状態（初回公開時）

| サービス | モード | 備考 |
|----------|--------|------|
| Gmail | mock | |
| MQTT | mock | |
| QNAP | mock | |
| Shelly | mock | |
| SwitchBot | mock | |

---

## インシデント・注意事項

（問題があれば記録）

---

## 署名

| 役割 | 氏名 | 日付 |
|------|------|------|
| デプロイ実施 | | |
| レビュー | | |
