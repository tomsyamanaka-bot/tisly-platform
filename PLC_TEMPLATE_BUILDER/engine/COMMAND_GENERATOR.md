# COMMAND_GENERATOR — GX Works3 命令生成エンジン

> TiSLY PLC Builder v2.5 / Engine  
> 機能3: GX Works3 生成 — 部品結合 → `GXW3_PURE_COMMANDS.txt`

---

## 目的

選定された部品（001〜007）とデバイス割付表を結合し、  
**GX Works3 ラダーエディタへ直接貼り付け可能** な IL 命令リストを生成する。

---

## 生成フロー

```
KEYWORD_ENGINE（部品選定）
        │
        ▼
DEVICE_ALLOCATOR（デバイス割付）
        │
        ▼
  1. 組み立て順序決定
        │
        ▼
  2. PLC_TEMPLATE_LIBRARY から部品 IL 取得
        │
        ▼
  3. プレースホルダ置換（X0, M1, Y0…）
        │
        ▼
  4. 部品 IL を連結
        │
        ▼
  5. 競合検査  ← README.md 監査セクション
        │
        ▼
  6. GXW3_PURE_COMMANDS.txt 出力
        │
        ▼
  GX Works3 へ貼り付け
```

---

## 組み立て順序（固定）

```
001 SELF HOLD
    ↓
002 ESTOP
    ↓
005 SENSOR LATCH × n
    ↓
003 BLINK SLOW  +  004 BLINK FAST
    ↓
006 RED LIGHT PRIORITY
    ↓
007 OUTPUT CONTROL
    ↓
END
```

**原則:** 002 ESTOP は必ず 001 の直後。007 は必ず最終出力段。

---

## 部品 IL ソース

| 部品 | ライブラリ参照 |
|------|--------------|
| 001 | `../../PLC_TEMPLATE_LIBRARY/001_SELF_HOLD.md` |
| 002 | `../../PLC_TEMPLATE_LIBRARY/002_ESTOP.md` |
| 003 | `../../PLC_TEMPLATE_LIBRARY/003_BLINK_SLOW.md` |
| 004 | `../../PLC_TEMPLATE_LIBRARY/004_BLINK_FAST.md` |
| 005 | `../../PLC_TEMPLATE_LIBRARY/005_SENSOR_LATCH.md` |
| 006 | `../../PLC_TEMPLATE_LIBRARY/006_RED_LIGHT_PRIORITY.md` |
| 007 | `../../PLC_TEMPLATE_LIBRARY/007_OUTPUT_CONTROL.md` |
| 完成参照 | `../../PLC_TEMPLATE_LIBRARY/008_HOME_SECURITY_DEMO.md` |

---

## 生成手順（詳細）

### Step 1: 001 SELF HOLD

```il
LD    X0
ANI   X1
SET   M0
LDI   X0
RST   M0
RST   M1
RST   M2
```

### Step 2: 002 ESTOP

```il
LD    X1
RST   M0
RST   M1
RST   M2
RST   Y0
RST   Y1
RST   Y2
RST   Y3
RST   Y4
```

### Step 3: 005 SENSOR LATCH × 2

```il
LD    M0
AND   X2
SET   M1
LD    M0
AND   X3
SET   M2
```

### Step 4: 003 + 004 + 006（点滅 + 優先度 → M20）

```il
LD    M2
AND   SM412
LD    M0
ANI   M2
AND   SM413
ORB
OUT   M20
```

### Step 5: 007 OUTPUT CONTROL

```il
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
```

### Step 6: END

```il
END
```

---

## 出力ファイル

| ファイル | パス | 用途 |
|---------|------|------|
| **GXW3_PURE_COMMANDS.txt** | プロジェクトルート | GX Works3 貼り付け用（正本） |
| OUTPUT_EXAMPLE.md | `./OUTPUT_EXAMPLE.md` | 生成例・検証参照 |

---

## 出力形式規則

| 項目 | 規則 |
|------|------|
| 命令セット | FX5UJ 専用（LD / ANI / SET / RST / OUT / ORB / END） |
| 1 行 1 命令 | 命令 + タブ + デバイス |
| コメント | 出力に含めない |
| 空行 | 出力に含めない |
| クロック | SM412（0.1s）/ SM413（1s）のみ |
| 禁止 | M8012 / M8013（FX3U 時代デバイス） |
| 末尾 | 必ず `END` |

---

## GX Works3 投入手順

```
1. GX Works3 でプロジェクトを開く
2. ラダーエディタで先頭段（0 段目）を選択
3. GXW3_PURE_COMMANDS.txt を開く
4. 全文をコピー
5. ラダーエディタへ貼り付け（Ctrl+V）
6. コンパイル（F4）でエラー 0 を確認
7. シミュレーションまたは実機で動作確認
```

詳細: `../../GXW3_IMPORT_MANUAL.md`

---

## プレースホルダ → 実デバイス置換例

| 部品 IL 内 | HOME_SECURITY 割付後 |
|-----------|---------------------|
| `{X_ARM}` | X0 |
| `{X_ESTOP}` | X1 |
| `{X_SENSOR_1}` | X2 |
| `{X_SENSOR_2}` | X3 |
| `{M_ARM}` | M0 |
| `{M_LATCH_1}` | M1 |
| `{M_LATCH_2}` | M2 |
| `{M_OUT_AGG}` | M20 |
| `{Y_MAIN}` | Y0 |
| `{Y_1}`〜`{Y_4}` | Y1〜Y4 |

---

## 生成後チェック（機能4 連携）

命令生成完了後、以下を自動検査する。

| 項目 | 参照 |
|------|------|
| 二重コイル | Y0 OUT が 1 行のみ |
| 重複 M / Y / X | 割付表と IL の一致 |
| SM412 / SM413 | 使用確認、M8012/13 禁止 |
| END | 末尾存在 |
| 非常停止優先 | X1 → 全 RST |

詳細: [README.md](./README.md) 機能4 セクション

---

## 生成コマンド（概念）

```bash
# Engine 実行（将来の CLI イメージ）
tishly-plc-build \
  --input  INPUT_SPEC.md \
  --output ../../GXW3_PURE_COMMANDS.txt \
  --template HOME_SECURITY
```

現時点では本ドキュメント群が Engine の仕様書として機能する。

---

**TiSLY PLC Builder v2.5 — COMMAND_GENERATOR**
