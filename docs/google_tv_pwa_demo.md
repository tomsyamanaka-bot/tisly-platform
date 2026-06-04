# Google TV / PWA デモ導線

`/sales` から各画面へリンクし、「誰が使うか」を併記しています。

| リンク | パス | 利用者 |
|--------|------|--------|
| Google TV 表示デモ | `/tv/TOMS001` | 来客・商談で大画面表示する担当 |
| 施工員アプリ | `/customer/TOMS001/install/home` | 現場で QR・設置写真・機器登録 |
| 現調アプリ | `/survey` | 営業・現調担当（写真・図面） |
| 案件管理 | `/business` | 見積・請求・入金の社内担当 |
| PRO Remote | `/customer/TOMS001/pro-remote` | お客様・監視センター |
| 図面プレビュー（営業） | `/sales/floor-preview` | ログイン不要の説明用 |

## TV プレビュー（別入口）

- `/tv` — 顧客選択前のプレビュー画面

## PWA manifest

- 施工: `/customer/:code/install/manifest.webmanifest`
- Business: `/business/manifest.webmanifest`
- PRO Remote: `/customer/:code/pro-remote/manifest.webmanifest`

商談では「ホーム画面に追加」ではなく、ブラウザのタブで開く運用でも問題ありません。
