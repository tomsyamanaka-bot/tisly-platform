# PWA アイコン最終確認ガイド

**最終更新:** 2026-06-18  
**アイコンバージョン:** `?v=2003`（青 TiSLY ロゴ）

---

## 確認済みアセット

| ファイル | 用途 |
|---------|------|
| `/icons/icon-192.png?v=2003` | manifest / Android |
| `/icons/icon-512.png?v=2003` | manifest maskable |
| `/apple-touch-icon.png` | iOS ホーム画面（180×180） |
| `server/public/service-worker.js` | `ICON_V = "?v=2003"` / キャッシュ名 `v2386` |

実務 PWA（`/app`, `/survey-v1`, `/schedule-v1` 等）は **青ロゴ** を参照。  
旧 **緑アイコン**（`#1a7f37` / `#5cb87a`）は manifest の `theme_color` や UI アクセントにのみ残存していたため、2026-06-18 に青系へ統一。

---

## iPhone Safari で古いアイコンが残る場合

iOS はホーム画面アイコンを **強くキャッシュ** します。アプリ更新後も古い緑アイコンが見える場合:

1. ホーム画面の TiSLY アイコンを **長押し → 削除**
2. Safari で https://tisly.jp/app を開く
3. 共有 **□↑** → **ホーム画面に追加**
4. 新しい青アイコンで起動を確認

PWA 内の案内: `/app` ログイン後、設定カード下部に同手順を表示（`app-hub.js`）。

### それでも変わらない場合

- Safari の履歴・Webサイトデータを TiSLY ドメインのみ削除
- 端末再起動後に再追加

---

## 再生成コマンド（デザイン変更時のみ）

```bash
node server/scripts/gen-pwa-icons.mjs
node server/scripts/sync-manifest-icons.mjs
node server/scripts/patch-pwa-sw-icon-version.mjs
```

`server/src/pwa/pwa-manifest-icons.ts` の `APP_ICON_VERSION` を上げ、Service Worker キャッシュ名も更新すること。
