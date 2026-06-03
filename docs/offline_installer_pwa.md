# Offline Installer PWA 設計

## 方針

1. **オフライン登録** — フォーム送信を `localStorage` キューへ
2. **一時保存** — キー `tisly_installer_queue_{customerCode}`
3. **復帰後同期** — `online` イベントで flush（TODO 実装）
4. **衝突** — サーバー側 serial/device_id UNIQUE で検知、手動マージ
5. **QR/NFC** — トークン期限があるためオフライン claim は非推奨
6. **写真** — base64 キューはサイズ注意（5MB 上限推奨）

## 注意

- プロビジョニングトークンはオンライン claim 必須
- テナント JWT の有効期限切れ時は再ログイン
- Service Worker は静的アセットのみキャッシュ（API は network-first）

## 実装状況

- [x] localStorage placeholder（`installer-mode.js`）
- [ ] flush worker
- [ ] 衝突 UI
