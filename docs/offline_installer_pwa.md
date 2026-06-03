# Offline Installer PWA 設計

## 方針

1. **オフライン登録** — フォーム送信を `localStorage` キューへ
2. **一時保存** — キー `tisly_installer_queue_{customerCode}`
3. **IndexedDB** — `tisly_installer_offline_v1`（メタ placeholder）
4. **復帰後同期** — `POST /api/customer/:code/install/sync`
5. **衝突** — `server/src/installer/offline-sync.ts`（`docs/offline_conflict_resolution.md`）
6. **QR/NFC** — トークン期限があるためオフライン claim は非推奨（キューは可能・同期時競合あり）
7. **写真** — ライブ `install/photos/upload` 推奨

## PWA 操作

- オフライン時: 現場作成 / ウィザード / QR / NFC をキューに積む
- オンライン復帰: **オフラインキュー同期** ボタン

## 注意

- プロビジョニングトークンはオンライン claim 推奨
- JWT 期限切れ時は再ログイン
- Service Worker は Push 専用（API キャッシュなし）

## 実装状況（Phase 361–380）

- [x] localStorage キュー
- [x] IndexedDB placeholder
- [x] flush via `install/sync`
- [x] 競合ルール（サーバー）
- [ ] 衝突詳細 UI
