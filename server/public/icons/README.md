# PWA Icons — TiSLY 六角シールド（Phase 2001）

公式 PWA アイコン。緑十字プレースホルダは廃止済み。

## 生成

```bash
node server/scripts/gen-pwa-icons.mjs
```

## ファイル

| ファイル | サイズ | 用途 |
|---------|--------|------|
| `icon-64.png` | 64×64 | favicon |
| `icon-128.png` | 128×128 | favicon / タブ |
| `icon-192.png` | 192×192 | apple-touch-icon / manifest |
| `icon-256.png` | 256×256 | manifest |
| `icon-384.png` | 384×384 | manifest |
| `icon-512.png` | 512×512 | manifest maskable |

`manifest-icons.json` は静的マニフェスト更新時の参照用。

## 反映

Service Worker キャッシュバージョン `tisly-pwa-v2001` を更新すると既存 PWA に新アイコンが配信されます。iOS ホーム画面アイコンは再インストール（削除→追加）が必要な場合があります。
