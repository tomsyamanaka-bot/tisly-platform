# OUTPUT_EXAMPLE — 生成出力サンプル

> TiSLY PLC Builder v2.5 / Engine  
> 標準入力仕様から生成される `GXW3_PURE_COMMANDS.txt` の完全例

---

## 入力仕様（再掲）

```
警戒スイッチ
非常停止
外周センサー
近接センサー
赤灯点滅
白灯4回路
```

---

## 部品選定結果

| # | 部品 | 役割 |
|---|------|------|
| 001 | SELF HOLD | X0 → M0 警戒保持 |
| 002 | ESTOP | X1 → 全 RST |
| 005 | SENSOR LATCH | M0 + X2 → M1 外周 |
| 005 | SENSOR LATCH | M0 + X3 → M2 近接 |
| 003 | BLINK SLOW | M0 + SM413 → 低速点滅 |
| 004 | BLINK FAST | M2 + SM412 → 高速点滅 |
| 006 | RED LIGHT PRIORITY | M2 優先 → M20 |
| 007 | OUTPUT CONTROL | M20→Y0, M1→Y1/Y2, M2→Y3/Y4 |

---

## デバイス割付表

### 入力 X

| デバイス | 名称 |
|---------|------|
| X0 | 警戒スイッチ |
| X1 | 非常停止 |
| X2 | 外周センサー |
| X3 | 近接センサー |

### 内部 M

| デバイス | 名称 |
|---------|------|
| M0 | 警戒中 |
| M1 | 外周警報 |
| M2 | 近接警報 |
| M20 | 赤灯制御 |

### 出力 Y

| デバイス | 名称 | 動作 |
|---------|------|------|
| Y0 | 赤灯 | 警戒: 1s 点滅 / 近接: 0.1s 点滅 |
| Y1 | 白灯1 | 外周警報: 常灯 |
| Y2 | 白灯2 | 外周警報: 1s 点滅 |
| Y3 | 白灯3 | 近接警報: 常灯 |
| Y4 | 白灯4 | 近接警報: 常灯 |

---

## 生成命令リスト（GXW3_PURE_COMMANDS.txt）

```
LD    X0
ANI   X1
SET   M0
LDI   X0
RST   M0
RST   M1
RST   M2
LD    X1
RST   M0
RST   M1
RST   M2
RST   Y0
RST   Y1
RST   Y2
RST   Y3
RST   Y4
LD    M0
AND   X2
SET   M1
LD    M0
AND   X3
SET   M2
LD    M2
AND   SM412
LD    M0
ANI   M2
AND   SM413
ORB
OUT   M20
LD    M20
OUT   Y0
LD    M1
OUT   Y1
LD    M1
AND   SM413
OUT   Y2
LD    M2
OUT   Y3
LD    M2
OUT   Y4
END
```

---

## 段構成対応

| 段 | 命令概要 | 部品 |
|:--:|---------|------|
| 0 | X0 + /X1 → SET M0 | 001 |
| 1 | /X0 → RST M0/M1/M2 | 001 |
| 2 | X1 → 全 RST | 002 |
| 3 | M0 + X2 → SET M1 | 005 |
| 4 | M0 + X3 → SET M2 | 005 |
| 5 | 点滅優先 → M20 | 003+004+006 |
| 6 | M20 → Y0 | 007 |
| 7 | M1 → Y1 | 007 |
| 8 | M1 + SM413 → Y2 | 003+007 |
| 9 | M2 → Y3 | 007 |
| 10 | M2 → Y4 | 007 |
| 11 | END | — |

---

## 監査結果

| # | 項目 | 結果 |
|---|------|:----:|
| 1 | 二重コイル（Y0） | ✅ OUT Y0 は 1 行のみ |
| 2 | 重複 M 番号 | ✅ M0/M1/M2/M20 一意 |
| 3 | 重複 Y 番号 | ✅ Y0〜Y4 一意 |
| 4 | 重複 X 番号 | ✅ X0〜X3 一意 |
| 5 | SM412 / SM413 | ✅ 使用確認 |
| 6 | M8012 / M8013 | ✅ 不使用 |
| 7 | END | ✅ 末尾に存在 |
| 8 | 非常停止優先 | ✅ X1 → 全 RST、001 は ANI X1 |

**監査: 全 8 項目 PASS**

---

## 出力状態表

| 状態 | Y0 | Y1 | Y2 | Y3 | Y4 |
|------|:--:|:--:|:--:|:--:|:--:|
| 停止 | OFF | OFF | OFF | OFF | OFF |
| 警戒中 (M0) | 1s 点滅 | OFF | OFF | OFF | OFF |
| 外周警報 (M1) | 1s 点滅* | ON | 1s 点滅 | OFF | OFF |
| 近接警報 (M2) | **0.1s 点滅** | ※ | ※ | ON | ON |
| 非常停止 (X1) | OFF | OFF | OFF | OFF | OFF |

\* M2 ON 時は 006 により高速点滅が最優先。

---

## 関連ファイル

| パス | 内容 |
|------|------|
| `../../GXW3_PURE_COMMANDS.txt` | プロジェクト正本 |
| `../generator/output_sample_home_security.txt` | v1 ジェネレータサンプル |
| `../../ladder/TiSLY_HOME_Security_DEMO.il` | 完成版 IL 参照 |

---

**TiSLY PLC Builder v2.5 — OUTPUT_EXAMPLE**
