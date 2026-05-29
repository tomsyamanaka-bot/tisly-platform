# template_selector — 部品選定結果

> TiSLY PLC Builder v1 / Generator  
> 入力: [spec_input_example.md](./spec_input_example.md)

---

## 入力仕様（再掲）

```
警戒スイッチX0、非常停止X1、外周センサーX2、近接センサーX3。
警戒中は赤ライトY0を1秒点滅。
外周検知でY1点灯、Y2点滅。
近接検知でY3/Y4点灯、赤ライト高速点滅。
非常停止で全OFF。
```

---

## キーワード → 部品 選定

| 仕様キーワード | 選定部品 | 根拠（BUILDER_RULES） |
|---------------|---------|----------------------|
| 警戒スイッチ / 警戒中 | **001 SELF HOLD** | モード切替・警戒 ON |
| 非常停止 / 全 OFF | **002 ESTOP** | 非常停止必須 |
| 1秒点滅 / 警戒中 Y0 | **003 BLINK SLOW** | 低速点滅 |
| 高速点滅 / 近接検知 Y0 | **004 BLINK FAST** | 高速点滅 |
| 外周検知 / 近接検知 | **005 SENSOR LATCH ×2** | センサー 2 種 → M1, M2 |
| 003 + 004 同時選定 | **006 RED LIGHT PRIORITY** | 自動追加（同一 Y0） |
| Y0〜Y4 出力 | **007 OUTPUT CONTROL** | Y 出力あり → 必須 |

---

## 選定部品一覧

```
001_SELF_HOLD
002_ESTOP
003_BLINK_SLOW
004_BLINK_FAST
005_SENSOR_LATCH
006_RED_LIGHT_PRIORITY
007_OUTPUT_CONTROL
```

---

## 選定結果（YAML）

```yaml
template: HOME_SECURITY
parts:
  - "001 SELF HOLD"
  - "002 ESTOP"
  - "003 BLINK SLOW"
  - "004 BLINK FAST"
  - "005 SENSOR LATCH (X2 → M1)"
  - "005 SENSOR LATCH (X3 → M2)"
  - "006 RED LIGHT PRIORITY"
  - "007 OUTPUT CONTROL"
io_ref: ../HOME_SECURITY_TEMPLATE.md
library: ../../PLC_TEMPLATE_LIBRARY/
```

---

## I/O 割り当て（テンプレート適用後）

| デバイス | 名称 | 担当部品 |
|---------|------|---------|
| X0 | 警戒スイッチ | 001 |
| X1 | 非常停止 | 002 |
| X2 | 外周センサー | 005 → M1 |
| X3 | 近接センサー | 005 → M2 |
| M0 | 警戒中 | 001 |
| M1 | 外周警報保持 | 005 |
| M2 | 近接警報保持 | 005 |
| M20 | Y0 制御集約 | 006, 007 |
| Y0 | 赤ライト | 003+004+006+007 |
| Y1 | 白ライト1 | 007 |
| Y2 | 白ライト2 | 003+007 |
| Y3 | 白ライト3 | 007 |
| Y4 | 白ライト4 | 007 |

---

**TiSLY PLC Builder v1 — template_selector**
