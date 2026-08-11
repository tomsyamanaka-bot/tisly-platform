# Google Play Console アップロード用

`npm run build:android` 実行後、ここに実ファイルが出力されます。

| ファイル | 用途 |
|---------|------|
| `TiSLY-com.tisly.app.aab` | Play Console へアップロードする AAB |
| `AAB_READY.txt` | 生成時刻・絶対パス・サイズの検証マーカー |

※ `.aab` はバイナリのため git 管理外です。手元に毎回生成してください。

```bash
npm run build:android
npm run android:open-aab
```
