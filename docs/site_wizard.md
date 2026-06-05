# Site Wizard（現場作成ウィザード）

## URL

- UI: `/site/new`
- API: `POST /api/deployment-kit/sites/wizard`

## 現場種別

| ID | ラベル | テンプレート |
|----|--------|-------------|
| kodate | 戸建 | ゾーン4 + 標準設備 |
| minpaku | 民泊 | ゾーン3 + スマートロック等 |
| factory | 工場 | PLC + Gateway |
| warehouse | 倉庫 | PLC + シャッター |
| kaigo | 介護 | 見守りセンサ + 緊急通報 |
| other | その他 | 最小 Gateway のみ |

作成時に `site-provisioner` がゾーン・テンプレ設備を自動投入します。
