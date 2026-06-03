# PWA Icons

本番デプロイ前に以下を配置してください。

| ファイル | サイズ |
|----------|--------|
| `icon-192.png` | 192×192 |
| `icon-512.png` | 512×512 |

`manifest.json` / `manifest.webmanifest` から参照されます。  
Phase 441–460 で placeholder PNG を同梱（`node server/scripts/gen-pwa-icons.mjs` で再生成可）。

生成例（ImageMagick）:

```bash
convert -size 192x192 xc:#1a7f37 -fill white -gravity center -pointsize 48 -annotate 0 "T" icon-192.png
```
