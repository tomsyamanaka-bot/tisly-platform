# VPS Phase 2041–2080 — PWA アイコン本番反映

> 目的: iPhone Safari で PWA 追加時に旧アイコン（緑十字）が出る問題を解消し、六角シールドを本番配信する。

関連: [`tisly_vps_deploy_step_by_step.md`](./tisly_vps_deploy_step_by_step.md) · Web UI `/deployment/checklist` · API `/api/deploy/pwa-icon-check`

---

## A. VPS 反映手順（智紀さんが実行）

```bash
cd /opt/tisly
git pull origin master
cd server
npm ci
npm run build
systemctl restart tisly-server
```

---

## B. curl 確認（新アイコン配信）

```bash
curl -sI https://tisly.jp/icons/icon-192.png?v=2001 | head -3
curl -sI https://tisly.jp/icons/icon-512.png?v=2001 | head -3
curl -sI https://tisly.jp/apple-touch-icon.png | head -3
curl -s https://tisly.jp/manifest.webmanifest?v=2001 | grep -o 'icon-192[^"]*' | head -3
curl -s https://tisly.jp/api/deploy/pwa-icon-check
```

期待:

- 各 icon URL が **HTTP 200**
- manifest の icons が `?v=2001` 付き
- `pwa-icon-check` の `ready: true`

---

## C. ブラウザ確認

1. **https://tisly.jp/deployment/checklist** を開く
2. 「再確認」をクリック
3. **PWAアイコン本番確認** セクションがすべて緑であること
4. **Safari再追加手順 OK** にチェック（実機完了後）

---

## D. iPhone Safari — PWA 再追加手順

1. 既存の TiSLY ホーム画面アイコンを長押し →「削除」
2. Safari で **https://tisly.jp/app** を開く
3. 共有ボタン →「ホーム画面に追加」
4. 追加画面のプレビューが **六角シールド** になっていることを確認
5. まだ **緑十字** なら: 設定 → Safari →「履歴とWebサイトデータを消去」→ 上記を再実行

---

## E. アイコンバージョン変更時

`server/src/pwa/pwa-manifest-icons.ts` の `APP_ICON_VERSION` を更新し、以下を実行:

```bash
cd server
node scripts/patch-manifest-icon-src.mjs
node scripts/patch-pwa-icon-hrefs.mjs
# service-worker.js の SW_VERSION / ICON_V も手動またはスクリプトで同期
npm run build
npm run test
```

---

## F. 完了条件

| 項目 | 確認 |
|------|------|
| icon-192 OK | curl / checklist 緑 |
| apple-touch-icon OK | curl 200 |
| manifest icons v=2001 OK | API `manifestIconsVersioned` |
| Safari 再追加手順 OK | 実機で六角シールド表示 |
