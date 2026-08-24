# PWA Icons — TiSLY 公式シールドエンブレム

公式シールドロゴ（`../tisly-shield-logo.png`）を
`tisly-logo-source.png` に同期し、各サイズを生成。

## 生成

```bash
node server/scripts/gen-pwa-icons.mjs
```

## ファイル

| ファイル | サイズ | 用途 |
|---------|--------|------|
| `../tisly-shield-logo.png` | 原寸 | ブランド原画 |
| `../tisly-shield-logo-128.png` | 128×128 | ヘッダー表示 |
| `icon-64.png` | 64×64 | favicon |
| `icon-128.png` | 128×128 | favicon / タブ |
| `icon-180.png` | 180×180 | apple-touch-icon 参照用 |
| `icon-192.png` | 192×192 | manifest / 通知 |
| `icon-256.png` | 256×256 | manifest |
| `icon-384.png` | 384×384 | manifest |
| `icon-512.png` | 512×512 | manifest maskable |
| `../apple-touch-icon.png` | 180×180 | iOS ホーム画面 |

`manifest-icons.json` は静的マニフェスト更新時の参照用。

## 反映

manifest / HTML の icon URL に `?v=2503` を付与し、Service Worker キャッシュ名を更新して旧アイコンを無効化します。iOS ホーム画面アイコンは再インストール（削除→追加）が必要な場合があります。
