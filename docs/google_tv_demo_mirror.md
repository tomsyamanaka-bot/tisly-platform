# Google TV デモ通知ミラー（Phase944）

## 動作

1. `/tv/:customerCode` が WS で `sales/demo/tv/{CODE}` を購読
2. 営業デモで通知発生 → 画面中央に大きな警告（10秒で通常画面へ）
3. ポーリング（15秒）も継続（customer portal API）

## リモコン

| キー | 動作 |
|------|------|
| ↑↓←→ | フォーカス移動 |
| Enter | 選択要素をクリック |
| Escape / Backspace | アラートオーバーレイを閉じる |

## WS 購読

```json
{ "type": "subscribe", "channel": "tv", "customerCode": "TOMS001" }
```

## 確認 URL

http://localhost:3080/tv/TOMS001
