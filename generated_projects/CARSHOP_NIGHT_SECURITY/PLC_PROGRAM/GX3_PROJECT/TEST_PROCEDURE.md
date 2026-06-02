# テスト手順 — CARSHOP_NIGHT_SECURITY

対象PLC: **FX5UJ-24MR/ES**  
プロジェクト: `CARSHOP_NIGHT_SECURITY.gx3`

---

## 1. 事前準備

| 項目 | 内容 |
|------|------|
| ソフト | GX Works3（FX5U/FX5UJ 対応版） |
| プロジェクト | `GX3_PROJECT/CARSHOP_NIGHT_SECURITY.gx3` を開く |
| I/O表 | `IO_LIST.csv` と突合 |
| デバイスコメント | `DEVICE_COMMENTS.csv` を GX Works3 へインポート（任意） |

---

## 2. プロジェクト打开〜書込み

1. GX Works3 → **プロジェクト** → **開く** → `CARSHOP_NIGHT_SECURITY.gx3`
2. CPU 型番が **FX5UJ-24MR/ES** であることを確認
3. **変換** → **プログラムチェック**（エラー 0 件）
4. エラーがある場合: MAIN を開き **F4（命令入力→ラダー変換）** を実行
5. **変換** → **コンパイル**（Shift+Alt+F4）
6. PLC 接続 → **オンライン** → **書込み** → プログラム + デバイスコメント
7. **RUN** に切替

---

## 3. シミュレーション / 実機テスト

| # | 操作 | 期待結果 | 確認 |
|---|------|----------|:----:|
| T1 | X0 ON | M0 ON、Y0 が約1秒周期（SM413）点滅 | ☐ |
| T2 | X0 ON + X2 ON | M1 ON、Y1 点灯、Y2 点滅 | ☐ |
| T3 | X0 ON + X6 ON | M2 ON、Y3/Y4 点灯、Y0 高速点滅（SM412） | ☐ |
| T4 | T3 状態で Y0 | 近接（M2）優先で高速点滅 | ☐ |
| T5 | X0 OFF | M0/M1/M2 OFF、全 Y OFF | ☐ |
| T6 | 動作中 X1 ON | 非常停止 — 全 M/Y 即時 OFF | ☐ |
| T7 | OUT Y0 | 1 か所のみ（M20 経由）— 二重コイルなし | ☐ |
| T8 | SM412/SM413 | 未定義エラーなし（FX5U 系クロック） | ☐ |

---

## 4. 安全確認

- 非常停止 X1 は b接点（NC）配線と極性一致
- 100V 出力（Y1〜Y4）は中継リレー経由
- 通電前: 配線図 `DRAWING/WIRING_DIAGRAM.md` と I/O 表を照合

---

## 5. 異常時

| 症状 | 対処 |
|------|------|
| プロジェクトが開けない | GX Works3 を最新版に更新 |
| SM412/SM413 未定義 | CPU が FX5UJ 系であることを確認 |
| ラダー未変換 | MAIN → 命令入力表示 → F4 |
| Y0 二重コイル | OUT Y0 は M20 経由 1 か所のみ |

---

生成: TiSLY GX3 Project Builder v1.0.0
