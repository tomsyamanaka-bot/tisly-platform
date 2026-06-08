# 智紀さんの ToDo（短く）

## 今すぐ — 本番反映（VPS）

コードは `origin/master` に push 済み。**VPS で pull → build → 再起動** すれば反映されます。

### 方法A: SSH で入れる場合（推奨）

自宅PC・スマホのターミナルアプリなど、**SSH が通る端末**から実行します。

```bash
ssh ユーザー名@tisly.jp
# 接続できたら:
cd /opt/tisly
git fetch origin
git pull origin master
cd server
npm run build
sudo systemctl restart tisly-server
sudo systemctl status tisly-server --no-pager
```

**成功の目安**

- `git pull` で最新コミットが取れる
- `npm run build` がエラーなく終わる
- `systemctl status` が `active (running)`

**反映確認（どちらか）**

```bash
curl -I https://tisly.jp/survey-v1
curl -I https://tisly.jp/estimate-v1
curl -I https://tisly.jp/app
```

→ すべて `HTTP/2 200` または `HTTP/1.1 200`

---

### 方法B: SSH がタイムアウトする場合 — ConoHa VNC コンソール

Cursor や一部ネットワークから `tisly.jp:22` が不通でも、**ConoHa 管理画面の VNC** なら VPS 内でコマンドを打てます。

1. [ConoHa コントロールパネル](https://cp.conoha.jp/) にログイン
2. **VPS** → 対象サーバー（tisly.jp）を選択
3. **コンソール** または **VNCコンソール** を開く（ブラウザ内の画面が VPS デスクトップ/ターミナル）
4. root またはデプロイ用ユーザーでログイン
5. 上記 **方法A** と同じコマンドを **VNC 内のターミナル** で実行

```bash
cd /opt/tisly
git pull origin master
cd server
npm run build
sudo systemctl restart tisly-server
sudo systemctl status tisly-server --no-pager
```

**VNC でうまくいかないとき**

- パスが違う場合: `ls /opt/tisly` でリポジトリの場所を確認
- `npm` がない: `which npm` / Node のバージョンを確認
- サービス名が違う: `systemctl list-units | grep tisly` で実名を確認

---

### 本番URL（反映後にスマホで開く）

| 用途 | URL |
|------|-----|
| App Hub | https://tisly.jp/app |
| 現調PWA v1 | https://tisly.jp/survey-v1 |
| 見積PWA v1 | https://tisly.jp/estimate-v1 |

### ログイン（デモ）

| 項目 | 値 |
|------|-----|
| 会社コード | `TOMS001` |
| ユーザー | `toms001.surveyor` |
| パスワード | `.env` の `CUSTOMER_DEMO_PASSWORD`（デモ用。本番は変更推奨） |

---

## スマホ確認の順番（実務フロー）

**iPhone Safari** を想定。PWA 化するとブラウザの戻る/進むが消えるため、**画面上部・下部のナビ**を使います。

1. **App Hub** `https://tisly.jp/app` にログイン
2. 「今日使うアプリ」で **現調する** をタップ
3. 下部ナビ **現調** → **見積** → **アプリ一覧** が切り替わるか確認
4. **現調** — 「＋ 新しい現調を作る」→ 電話・住所・メモ → 部材カード → **見積へ送る**
5. **見積** — 「見積待ち一覧」→ 案件タップ → 数量・単価 → **見積を確定** → **PDFプレビュー**
6. **TOMS形式で確認** が開くか
7. 上部 **← 戻る** / **🏠 アプリ一覧** が使えるか

### ホーム画面に追加（任意）

Safari → 共有 → **ホーム画面に追加**

| URL | 見え方 |
|-----|--------|
| `/app` | 業務アプリ一覧 |
| `/survey-v1` | 現調（緑） |
| `/estimate-v1` | 見積（青） |

---

## スマホ確認チェックリスト

### App Hub（/app）

- [ ] ログインできる（会社コード・ユーザー・パスワード）
- [ ] 「今日使うアプリ」に **現調する**・**見積を作る** の大きいカードがある
- [ ] **作業報告**・**顧客**・**在庫** は「準備中」と分かる
- [ ] 下部ナビで **アプリ一覧 / 現調 / 見積** に移動できる
- [ ] 下部の「準備中」タブを押すとメッセージが出る
- [ ] 上部 **← 戻る**・**🏠** が表示される

### 現調PWA（/survey-v1）

- [ ] 「＋ 新しい現調を作る」ボタンが指で押しやすい（大きい）
- [ ] 依頼主・依頼主住所・現場名・工事場所・担当者・電話・メールが入力できる
- [ ] **カメラで撮る** と **写真を選ぶ**（ライブラリ複数枚）ができる
- [ ] 文字だけメモ ができる
- [ ] 写真がカード表示される（100枚超でもスクロール・さらに表示）
- [ ] 部材をカードで選んで追加できる（防犯カメラ〜その他）
- [ ] **見積へ送る** が画面下付近で見つけやすい
- [ ] 送ったあと「見積もり作成待ち」と表示される
- [ ] エラー時に「次に何をすればいいか」が分かる文言になる
- [ ] 上部 **← 戻る** で一覧に戻れる

### 見積PWA（/estimate-v1）

- [ ] **見積待ち一覧** に現調から送った案件が出る
- [ ] 案件タップで見積が作れる / 開ける
- [ ] **＋ 項目を追加** で複数行、削除・並び替えができる
- [ ] 項目名・数量・単価を直せる
- [ ] 小計・消費税（10%）・税込合計が自動で変わる
- [ ] 備考欄が PDF に反映される
- [ ] **PDFプレビュー** が 401 にならず表示される（確定前でも可）
- [ ] **内訳を保存** → **見積を確定** の流れができる
- [ ] 確定後 **PDFプレビュー** が表示される（別タブで開くも可）
- [ ] **TOMS形式で確認** で JSON が見える
- [ ] 「← 現調の内容を見る」リンクが使える
- [ ] 下部ナビで現調アプリに戻れる

### 共通（3アプリ）

- [ ] 文字だらけではなくカード中心の見た目
- [ ] 専門用語（API・workflow 等）が画面に出ていない
- [ ] スタンドアロン（ホーム画面追加）でもログインが維持される
- [ ] Remote Test / Lite Security Demo が壊れていない（必要なら別途確認）

---

## 本番前に必須（セキュリティ）

3. **Gmail アプリパスワード** を `.env` に設定 → App Hub でテスト送信
4. **VAPID 鍵** を生成（`cd server && npm run vapid:setup`）
5. **JWT_SECRET** を本番用に再生成
6. **CUSTOMER_DEMO_PASSWORD** を本番では変更 or 無効化

## できれば早め

7. TOMS 標準フォーマット仕様書の共有 → 見積エクスポート本番接続
8. Google Calendar OAuth（Business カレンダー連携を使う場合）

## やらなくていい（Cursor が進める）

- 自走管理ドキュメントの更新
- UI改善・単体テスト
