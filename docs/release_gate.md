# Release Gate — tisly.jp 本番投入前ゲート（Phase 1291–1320）

智紀さん向け。**VPS へ実デプロイする前**に、ローカルで必ず通す検電器です。

```bash
cd server
npm run release:gate
```

---

## 合否基準

### 合格（OK）→ VPS デプロイ手順へ進める

以下が **すべて** 満たされたとき `PASS` です。

| ステップ | 内容 |
|----------|------|
| 1 | `npm run build` 成功 |
| 2 | `npx tsc --noEmit` エラーなし |
| 3 | `npm run test` — 全件 pass |
| 4 | `npm run deploy:dry-run` — fail 0 |

dry-run の個別チェック（すべて fail 0）:

- `.env.production.example` 存在・必須キー揃い
- `JWT_SECRET` / `ADMIN_PASSWORD_HASH` は空テンプレのまま（VPS で設定）
- git diff に実値 secret が含まれていない
- `server/uploads/` が `.gitignore` 対象
- `TISLY_PUBLIC_URL=https://tisly.jp` 想定
- `deploy/nginx/tisly.jp.conf` 存在・必須ルートあり
- PWA URL 一覧が publish-audit と一致
- service-worker / manifest / icons 参照 OK

### 不合格（NG）→ 止める

- 上記いずれか 1 つでも fail
- secret が git diff に含まれる
- uploads が git 追跡対象
- PWA が `not_ready`（SW / icons 不足など）

**NG のまま VPS へ進めない。** 修正 → `npm run release:gate` 再実行。

---

## mock のまま公開していい項目（初回公開）

初回 tisly.jp 公開は **営業デモ安全** を優先し、以下は mock のままで OK です。

| サービス | 初回公開の env |
|----------|----------------|
| Gmail / Google OAuth | `GMAIL_SEND_MODE=mock`, `GOOGLE_OAUTH_ENABLED=false` |
| QNAP Business WebDAV | `QNAP_UPLOAD_MODE=mock` |
| QNAP SMB Archive | `QNAP_MODE=mock` |
| Shelly | `SHELLY_MODE=mock` |
| MQTT | `MQTT_MODE=mock`, `MQTT_MOCK_MODE=true` |
| Google TV Web | ローカル API + focus-camera mock（実テレビ操作なし） |

公開してよい URL（HTTPS 200 / SPA 正常表示）:

1. `https://tisly.jp/app` — App Hub（本番公開チェックカード）
2. `https://tisly.jp/survey` — 現調 PWA
3. `https://tisly.jp/business` — TOMS Business
4. `https://tisly.jp/sales` — 営業デモ
5. `https://tisly.jp/customer/TOMS001` — 顧客ポータル
6. `https://tisly.jp/customer/TOMS001/pro-remote` — PRO Remote
7. `https://tisly.jp/customer/TOMS001/install/home` — 施工 PWA
8. `https://tisly.jp/tv/TOMS001` — Google TV Web（PWA ではない）
9. `https://tisly.jp/deployment/checklist` — 導入チェックリスト

---

## real 切替前に必ず止める項目

以下を real にする前に、**別フェーズ・別チェックリスト**で承認を取ること。

| 項目 | リスク |
|------|--------|
| `GMAIL_SEND_MODE=real` | 顧客へ実メール送信 |
| `QNAP_UPLOAD_MODE=real` | NAS へ PDF 上書き |
| `QNAP_MODE=real` | SMB 書込・資格情報 |
| `SHELLY_MODE=real` | リレー遠隔操作 |
| `MQTT_MODE=real` | ブローカー接続・デバイスコマンド |
| `DEMO_RESET_ENABLED=true` | 本番データ消去 |
| `TISLY_DEMO_MODE=true` | 本番でのデモ自動起動 |

また VPS 初回デプロイ時は必ず設定:

- `JWT_SECRET` — `openssl rand -hex 32`
- `ADMIN_PASSWORD_HASH` — 管理者パスワードのハッシュ
- `INGEST_SECRET` — `openssl rand -hex 24`

---

## 初回公開の推奨順序（人間作業）

Release Gate 合格後、以下の順で確認してください。

1. **mock 公開** — VPS にデプロイ、env は mock 維持
2. **iPhone 確認** — Safari で `/survey` → ホーム画面追加 → standalone 起動
3. **Android 確認** — Chrome で `/app` → ホーム画面追加 → 公開チェックカード表示
4. **管理画面確認** — `/app` ログイン、Business / PRO Remote 導線
5. **1 案件だけ試験** — TOMS001 等 1 顧客で E2E（見積・施工・ポータル）

---

## 参照

- 自動チェック: `server/scripts/deploy-dry-run.ts`
- API: `GET /api/deploy/dry-run`, `GET /api/deploy/release-gate`
- UI: `/app` 本番公開チェックカード
- VPS 手順: `docs/tisly_jp_deploy_runbook.md`
- mock/real 詳細: `docs/mock_real_modes.md`
