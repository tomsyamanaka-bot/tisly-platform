#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.10 — PLC 容量自動選定
入力/出力点数から余裕率を計算し、PLC 本体・拡張ユニットを提案する。
SITE_SURVEY / TOMS_QUOTE / PROJECT_README / TEST_REPORT へ連携する。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from device_estimator import PLC_MODELS, PlcModel, get_plc_by_model

VERSION = "v5.10"

SITE_SURVEY_CONFIRM_NOTES: tuple[str, ...] = (
    "将来増設予定があるか確認",
    "予備入力を2点以上残す",
    "予備出力を2点以上残す",
    "80%以上使用時は上位PLCまたは拡張ユニットを検討",
)

EXTENSION_INPUT = "FX5U-16EX"
EXTENSION_OUTPUT = "FX5U-16EYR"
EXTENSION_INPUT_POINTS = 16
EXTENSION_OUTPUT_POINTS = 16

JUDGMENT_OK = "OK — 現在PLCで問題なし"
JUDGMENT_CAUTION = "注意 — 余裕が少ない（70%以上使用）"
JUDGMENT_UPGRADE = "推奨 — 1ランク上のPLCを検討（80%以上使用）"
JUDGMENT_NG = "不適合 — 上位機種必須（90%以上使用または容量超過）"


@dataclass(frozen=True)
class PlcCapacityMetrics:
    used_inputs: int
    used_outputs: int
    max_inputs: int
    max_outputs: int
    spare_inputs: int
    spare_outputs: int
    input_usage_pct: float
    output_usage_pct: float
    input_margin_pct: float
    output_margin_pct: float
    worst_usage_pct: float


@dataclass(frozen=True)
class PlcSelectionResult:
    current_plc_model: str
    current_plc: PlcModel
    metrics: PlcCapacityMetrics
    judgment: str
    recommended_plc: str
    recommended_extensions: tuple[str, ...]
    notes: tuple[str, ...]


def _resolve_plc(model: str) -> PlcModel:
    plc = get_plc_by_model(model)
    if plc:
        return plc
    return PLC_MODELS[0]


def _plc_rank(model: str) -> int:
    plc = get_plc_by_model(model)
    if plc:
        for idx, candidate in enumerate(PLC_MODELS):
            if candidate.model == plc.model:
                return idx
    normalized = model.upper().replace("FX5UJ", "FX5U")
    for idx, candidate in enumerate(PLC_MODELS):
        key = candidate.model.upper().replace("FX5UJ", "FX5U").split("/")[0]
        if normalized.startswith(key):
            return idx
    return 0


def _display_model(plc: PlcModel) -> str:
    return plc.model.replace("/ES", "") if "32MR" in plc.model or "48MR" in plc.model else plc.model


def compute_capacity_metrics(
    used_inputs: int,
    used_outputs: int,
    plc: PlcModel,
) -> PlcCapacityMetrics:
    max_in = plc.max_inputs
    max_out = plc.max_outputs
    spare_in = max(0, max_in - used_inputs)
    spare_out = max(0, max_out - used_outputs)
    input_usage = (used_inputs / max_in * 100) if max_in else 100.0
    output_usage = (used_outputs / max_out * 100) if max_out else 100.0
    return PlcCapacityMetrics(
        used_inputs=used_inputs,
        used_outputs=used_outputs,
        max_inputs=max_in,
        max_outputs=max_out,
        spare_inputs=spare_in,
        spare_outputs=spare_out,
        input_usage_pct=round(input_usage, 1),
        output_usage_pct=round(output_usage, 1),
        input_margin_pct=round(100.0 - input_usage, 1),
        output_margin_pct=round(100.0 - output_usage, 1),
        worst_usage_pct=round(max(input_usage, output_usage), 1),
    )


def _judge_usage(worst_usage_pct: float, over_capacity: bool) -> str:
    if over_capacity or worst_usage_pct >= 90:
        return JUDGMENT_NG
    if worst_usage_pct >= 80:
        return JUDGMENT_UPGRADE
    if worst_usage_pct >= 70:
        return JUDGMENT_CAUTION
    return JUDGMENT_OK


def _recommend_plc(current_rank: int, judgment: str, over_capacity: bool) -> str:
    if judgment in (JUDGMENT_UPGRADE, JUDGMENT_NG):
        next_rank = min(current_rank + 1, len(PLC_MODELS) - 1)
        if over_capacity and current_rank >= len(PLC_MODELS) - 1:
            return _display_model(PLC_MODELS[-1])
        if next_rank > current_rank:
            return _display_model(PLC_MODELS[next_rank])
    return _display_model(PLC_MODELS[current_rank])


def _recommend_extensions(
    metrics: PlcCapacityMetrics,
) -> tuple[str, ...]:
    input_short = metrics.used_inputs > metrics.max_inputs
    output_short = metrics.used_outputs > metrics.max_outputs
    if input_short and output_short:
        return (EXTENSION_INPUT, EXTENSION_OUTPUT)
    if input_short:
        return (EXTENSION_INPUT,)
    if output_short:
        return (EXTENSION_OUTPUT,)
    return ()


def _build_notes(
    metrics: PlcCapacityMetrics,
    judgment: str,
    extensions: tuple[str, ...],
) -> tuple[str, ...]:
    notes: list[str] = []
    if metrics.worst_usage_pct >= 70:
        notes.append("I/O 使用率が 70% を超えています。将来の増設余地を確保してください。")
    if metrics.worst_usage_pct >= 80:
        notes.append("使用率 80% 以上のため、1ランク上の PLC 本体への変更を推奨します。")
    if metrics.worst_usage_pct >= 90:
        notes.append("使用率 90% 以上 — 上位機種への変更が必須です。")
    if extensions:
        if EXTENSION_INPUT in extensions and EXTENSION_OUTPUT in extensions:
            notes.append(
                f"入出力ともに不足 — {EXTENSION_INPUT}（+{EXTENSION_INPUT_POINTS}点）"
                f" + {EXTENSION_OUTPUT}（+{EXTENSION_OUTPUT_POINTS}点）を追加してください。"
            )
        elif EXTENSION_INPUT in extensions:
            notes.append(
                f"入力不足 — {EXTENSION_INPUT}（+{EXTENSION_INPUT_POINTS}点）を追加してください。"
            )
        elif EXTENSION_OUTPUT in extensions:
            notes.append(
                f"出力不足 — {EXTENSION_OUTPUT}（+{EXTENSION_OUTPUT_POINTS}点）を追加してください。"
            )
    if judgment == JUDGMENT_OK and not extensions:
        notes.append("現在の PLC 構成で十分な余裕があります。")
    if not notes:
        notes.append("特記事項なし。")
    return tuple(notes)


def analyze_plc_selection(
    current_plc_model: str,
    used_inputs: int,
    used_outputs: int,
) -> PlcSelectionResult:
    """現在 PLC と使用点数から選定結果を返す。"""
    current_plc = _resolve_plc(current_plc_model)
    metrics = compute_capacity_metrics(used_inputs, used_outputs, current_plc)
    over_capacity = (
        used_inputs > current_plc.max_inputs
        or used_outputs > current_plc.max_outputs
    )
    judgment = _judge_usage(metrics.worst_usage_pct, over_capacity)
    rank = _plc_rank(current_plc_model)
    recommended_plc = _recommend_plc(rank, judgment, over_capacity)
    extensions = _recommend_extensions(metrics)
    notes = _build_notes(metrics, judgment, extensions)
    return PlcSelectionResult(
        current_plc_model=current_plc_model,
        current_plc=current_plc,
        metrics=metrics,
        judgment=judgment,
        recommended_plc=recommended_plc,
        recommended_extensions=extensions,
        notes=notes,
    )


def generate_plc_selection_md(
    current_plc_model: str,
    used_inputs: int,
    used_outputs: int,
) -> str:
    """PLC_SELECTION.md を生成する。"""
    result = analyze_plc_selection(current_plc_model, used_inputs, used_outputs)
    m = result.metrics
    ext_text = (
        " + ".join(result.recommended_extensions)
        if result.recommended_extensions
        else "不要"
    )
    notes_text = "\n".join(f"- {n}" for n in result.notes)

    return f"""# PLC 容量選定 — {current_plc_model}

> TiSLY PLC Builder {VERSION} 自動生成

---

## 現在 PLC

| 項目 | 内容 |
|------|------|
| 型番 | {result.current_plc_model} |
| 最大入力 | {m.max_inputs} 点 |
| 最大出力 | {m.max_outputs} 点 |

---

## 入力使用状況

| 項目 | 値 |
|------|-----|
| 使用入力点数 | {m.used_inputs} 点 |
| 入力余裕点数 | {m.spare_inputs} 点 |
| 入力使用率 | {m.input_usage_pct} % |
| 入力余裕率 | {m.input_margin_pct} % |

---

## 出力使用状況

| 項目 | 値 |
|------|-----|
| 使用出力点数 | {m.used_outputs} 点 |
| 出力余裕点数 | {m.spare_outputs} 点 |
| 出力使用率 | {m.output_usage_pct} % |
| 出力余裕率 | {m.output_margin_pct} % |

---

## 余裕率サマリー

| 項目 | 値 |
|------|-----|
| 最大使用率 | {m.worst_usage_pct} % |
| 判定基準 | 70% 注意 / 80% 1ランク上推奨 / 90% 不適合 |

---

## 判定

**{result.judgment}**

---

## 推奨 PLC

| 項目 | 内容 |
|------|------|
| 推奨本体 | {result.recommended_plc} |
| 推奨拡張ユニット | {ext_text} |

### 候補機種

| ランク | 型番 | 入力 | 出力 |
|:------:|------|:----:|:----:|
| 1 | FX5UJ-24MR/ES | 14 | 10 |
| 2 | FX5U-32MR | 16 | 16 |
| 3 | FX5U-48MR | 24 | 24 |

### 拡張ユニット

| 不足 | 推奨ユニット | 追加点数 |
|------|-------------|:--------:|
| 入力 | {EXTENSION_INPUT} | +{EXTENSION_INPUT_POINTS} |
| 出力 | {EXTENSION_OUTPUT} | +{EXTENSION_OUTPUT_POINTS} |

---

## 注意事項

{notes_text}

---

**TiSLY PLC Builder {VERSION} — PLC_SELECTION**
"""


def plc_selection_has_used_inputs(text: str) -> bool:
    return "使用入力点数" in text and any(c.isdigit() for c in text.split("使用入力点数")[-1][:20])


def plc_selection_has_used_outputs(text: str) -> bool:
    return "使用出力点数" in text and any(c.isdigit() for c in text.split("使用出力点数")[-1][:20])


def plc_selection_has_margin(text: str) -> bool:
    return "余裕率" in text


def plc_selection_has_judgment(text: str) -> bool:
    return "## 判定" in text and (
        "OK" in text or "注意" in text or "推奨" in text or "不適合" in text
    )


def plc_selection_has_recommended_plc(text: str) -> bool:
    return "推奨本体" in text and "FX5U" in text


def _format_extensions(extensions: tuple[str, ...]) -> str:
    return " + ".join(extensions) if extensions else "不要"


def format_site_survey_plc_section(result: PlcSelectionResult) -> str:
    """SITE_SURVEY.md 用 PLC容量確認セクション。"""
    m = result.metrics
    ext_text = _format_extensions(result.recommended_extensions)
    notes_text = "\n".join(f"- {note}" for note in SITE_SURVEY_CONFIRM_NOTES)
    return f"""## PLC容量確認

| 項目 | 内容 |
|------|------|
| 選定PLC | {result.current_plc_model} |
| 入力使用点数 | {m.used_inputs} 点 |
| 出力使用点数 | {m.used_outputs} 点 |
| 入力余裕点数 | {m.spare_inputs} 点 |
| 出力余裕点数 | {m.spare_outputs} 点 |
| 入力使用率 | {m.input_usage_pct} % |
| 出力使用率 | {m.output_usage_pct} % |
| 判定 | {result.judgment} |
| 推奨PLC | {result.recommended_plc} |
| 推奨拡張ユニット | {ext_text} |

### 現場確認メモ

{notes_text}

---
"""


def format_toms_summary_plc_section(result: PlcSelectionResult) -> str:
    """TOMS_QUOTE_SUMMARY.md 用 PLC容量判定セクション。"""
    m = result.metrics
    ext_text = _format_extensions(result.recommended_extensions)
    return f"""## PLC容量判定

| 項目 | 内容 |
|------|------|
| 現在PLC | {result.current_plc_model} |
| 推奨PLC | {result.recommended_plc} |
| 入力使用率 | {m.input_usage_pct} % |
| 出力使用率 | {m.output_usage_pct} % |
| 判定 | {result.judgment} |
| 拡張ユニット候補 | {ext_text} |

---
"""


def format_readme_plc_section(result: PlcSelectionResult) -> str:
    """PROJECT_README.md 用 PLC容量・拡張判定セクション。"""
    m = result.metrics
    ext_text = _format_extensions(result.recommended_extensions)
    summary = (
        f"選定PLC **{result.current_plc_model}** — "
        f"入力 {m.used_inputs}/{m.max_inputs} 点（{m.input_usage_pct}%） / "
        f"出力 {m.used_outputs}/{m.max_outputs} 点（{m.output_usage_pct}%） / "
        f"判定: {result.judgment}"
    )
    return f"""## PLC容量・拡張判定

> PLC_SELECTION.md の要約

{summary}

| 項目 | 内容 |
|------|------|
| 推奨PLC | {result.recommended_plc} |
| 拡張ユニット候補 | {ext_text} |
| 入力余裕 | {m.spare_inputs} 点（余裕率 {m.input_margin_pct}%） |
| 出力余裕 | {m.spare_outputs} 点（余裕率 {m.output_margin_pct}%） |

### 将来増設時の注意

- 予備入力・出力を **2点以上** 確保してください。
- 使用率 **80% 超** の場合は上位 PLC 本体または拡張ユニット（{ext_text}）を検討してください。
- 詳細は `SPEC/PLC_SELECTION.md` を参照してください。

---
"""


def plc_capacity_excel_rows(result: PlcSelectionResult) -> list[tuple[str, str]]:
    """TOMS_QUOTE.xlsx PLC容量判定シート用行。"""
    m = result.metrics
    ext_text = _format_extensions(result.recommended_extensions)
    return [
        ("PLC型番", result.current_plc_model),
        ("入力使用点数", f"{m.used_inputs} 点"),
        ("出力使用点数", f"{m.used_outputs} 点"),
        ("入力余裕率", f"{m.input_margin_pct} %"),
        ("出力余裕率", f"{m.output_margin_pct} %"),
        ("判定", result.judgment),
        ("推奨PLC", result.recommended_plc),
        ("推奨拡張ユニット", ext_text),
    ]


def site_survey_has_plc_capacity(text: str) -> bool:
    return "## PLC容量確認" in text and "選定PLC" in text and "現場確認メモ" in text


def toms_summary_has_plc_judgment(text: str) -> bool:
    return "## PLC容量判定" in text and "現在PLC" in text and "拡張ユニット候補" in text


def readme_has_plc_capacity(text: str) -> bool:
    return "## PLC容量・拡張判定" in text and "PLC_SELECTION.md" in text


def xlsx_has_plc_capacity(path: Path) -> bool:
    """xlsx 内に PLC容量判定シートまたは欄があるか。"""
    if not path.is_file():
        return False
    try:
        import zipfile

        has_sheet_name = False
        has_content = False
        with zipfile.ZipFile(path, "r") as zf:
            for name in zf.namelist():
                if name.endswith(".xml"):
                    content = zf.read(name).decode("utf-8", errors="replace")
                    if "PLC容量判定" in content:
                        has_sheet_name = True
                    if "入力余裕率" in content:
                        has_content = True
        return has_sheet_name and has_content
    except (OSError, zipfile.BadZipFile):
        return False
