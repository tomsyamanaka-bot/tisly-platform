# validation_checklist — 出力監査チェックリスト

> TiSLY PLC Builder v1 / Generator  
> `output_sample_home_security.txt` 生成後の必須確認項目

---

## 監査項目

| # | 項目 | 確認内容 | 本例 |
|---|------|---------|:----:|
| 1 | **FX5UJ 専用** | FX5U シリーズ（FX5UJ）向け命令セット。FX3U 専用デバイスを使用していない | ✅ |
| 2 | **SM412 / SM413 使用** | 点滅クロックに SM412（0.1s）/ SM413（1s）を使用 | ✅ |
| 3 | **M8012 / M8013 禁止** | FX3U 時代の M8012 / M8013 が命令中に含まれない | ✅ |
| 4 | **Y0 二重コイルなし** | Y0 への OUT は 1 行のみ。点滅は M20 経由で集約（006+007） | ✅ |
| 5 | **END あり** | プログラム末尾に `END` 命令が存在する | ✅ |
| 6 | **GX Works3 貼り付け可能** | タブ区切り IL 形式。GX Works3 ラダーエディタへ直接貼り付け可能 | ✅ |
| 7 | **非常停止優先** | X1 ON 時、全 M / 全 Y を RST。002 ESTOP が最優先段 | ✅ |
| 8 | **センサー保持あり** | M0 警戒中 + Xn ON → Mn SET 保持。005 SENSOR LATCH 動作 | ✅ |

---

## 詳細確認手順

### FX5UJ 専用

```
□ LD / ANI / SET / RST / OUT / ORB / END のみ使用
□ 特殊補助リレーは SM412 / SM413 のみ
□ D レジスタ・タイマ命令なし（本テンプレート範囲）
```

### SM412 / SM413 使用

```
□ Y0 低速点滅: M0 + SM413（003 BLINK SLOW）
□ Y0 高速点滅: M2 + SM412（004 BLINK FAST）
□ Y2 点滅: M1 + SM413
```

### M8012 / M8013 禁止

```
□ 命令リスト全文を検索 → M8012 / M8013 が 0 件
```

### Y0 二重コイルなし

```
□ OUT Y0 は 1 行のみ（LD M20 / OUT Y0）
□ 003 / 004 は M20 に OUT（Y0 直接 OUT 禁止）
```

### END あり

```
□ 最終行が END
□ END 以降に命令なし
```

### GX Works3 貼り付け可能

```
□ 1 行 1 命令（命令 + デバイス）
□ 空行なし（貼り付け時は END まで連続）
□ コメント行なし
```

### 非常停止優先

```
□ X1 ON → RST M0, M1, M2, Y0〜Y4
□ 001 の SET M0 は ANI X1 条件付き
```

### センサー保持あり

```
□ LD M0 / AND X2 / SET M1（外周）
□ LD M0 / AND X3 / SET M2（近接）
□ X0 OFF または X1 ON で M1 / M2 解除
```

---

## 監査結果サマリ

```
対象: output_sample_home_security.txt
部品: 001, 002, 003, 004, 005×2, 006, 007
テンプレート: HOME_SECURITY
監査: 全 8 項目 PASS
```

---

**TiSLY PLC Builder v1 — validation_checklist**
