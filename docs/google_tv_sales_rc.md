# Google TV 営業デモ RC（Phase 981–1000）

## URL

- `/tv/TOMS001`（他顧客コード可）

## 通知表示

- WS `tv` チャンネル + `sales/demo/tv/{code}` トピック
- 大画面アラート **10 秒** 後に通常画面へ自動復帰
- `/sales` の「TVに送る」→ `POST /api/demo-kit/tv/push`

## リモコン

| キー | 動作 |
|------|------|
| Enter | 詳細オーバーレイ |
| Back / Esc | 通常画面（アラート・詳細を閉じる） |
| ↑ / ↓ | 表示切替（概要 / カメラ / 設備） |

## 確認

1. `/tv/TOMS001` を Chrome / Google TV で開く
2. `/sales` から「TVに送る」
3. アラート表示 → 10 秒で戻る → Enter で詳細
