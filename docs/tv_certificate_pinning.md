# TV 証明書ピンニング（準備）

本番証明書未確定のため **プレースホルダ** で実装。

## 環境変数

| 変数 | 説明 |
|------|------|
| `TV_CERT_PINNING_ENABLED` | `true` でピンニング有効 |
| `TV_CERT_FINGERPRINT` | 例 `sha256/ABCD...` |

## サーバー

`config.tv.certPinningEnabled` / `certFingerprint` — TV API レスポンスに含める。

## tv-app（Expo）— Phase 281+

- `EXPO_PUBLIC_TV_CERT_PINNING_ENABLED`
- `EXPO_PUBLIC_TV_CERT_FINGERPRINT`
- `tv-app/src/services/api.ts` — `getCertPinningStatus()` / `lastVerification`
- Settings 画面: fingerprint・pinning enabled・最終検証状態を表示
- `CertPinWarningScreen.tsx` — mismatch 時の警告 placeholder

## TODO

- Android Network Security Config / iOS TrustKit 連携
- 本番証明書確定後に fingerprint を差し替え
- mismatch 時に `CertPinWarningScreen` へ自動遷移
