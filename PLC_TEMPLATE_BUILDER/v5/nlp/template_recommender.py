#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.2 — テンプレート推定
日本語文章から最適な用途別テンプレートを推定する。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from intent_parser import ParsedIntent, extract_keywords, load_dictionary, normalize_text

VALID_TEMPLATES = (
    "HOME_SECURITY",
    "CARSHOP_SECURITY",
    "WAREHOUSE_SECURITY",
    "MINPAKU_COUNTER",
    "FACTORY_SAFETY",
)


@dataclass
class TemplateScore:
    template: str
    score: float
    max_score: float
    confidence: int
    reasons: list[str] = field(default_factory=list)


@dataclass
class Recommendation:
    template: str
    confidence: int
    reasons: list[str]
    scores: list[TemplateScore] = field(default_factory=list)
    parsed: ParsedIntent | None = None

    def format_summary(self) -> str:
        reason_text = "\n".join(self.reasons) if self.reasons else "（キーワード一致なし）"
        return (
            f"推定：\n{self.template}\n\n"
            f"一致率：\n{self.confidence}%\n\n"
            f"理由：\n{reason_text}"
        )


def _template_max_score(template_data: dict) -> float:
    return float(sum(int(entry.get("weight", 1)) for entry in template_data["keywords"]))


def _collect_reasons(matches: list) -> list[str]:
    seen: set[str] = set()
    reasons: list[str] = []
    for match in sorted(matches, key=lambda item: (-item.weight, item.label)):
        if match.label not in seen:
            seen.add(match.label)
            reasons.append(match.label)
    return reasons


def score_templates(parsed: ParsedIntent, dictionary: dict) -> list[TemplateScore]:
    scores: list[TemplateScore] = []

    for template_name in VALID_TEMPLATES:
        template_data = dictionary["templates"][template_name]
        matches = parsed.matches_by_template.get(template_name, [])
        raw_score = float(sum(match.weight for match in matches))
        max_score = _template_max_score(template_data)
        confidence = int(round(min(raw_score / max_score, 1.0) * 100)) if max_score else 0
        scores.append(
            TemplateScore(
                template=template_name,
                score=raw_score,
                max_score=max_score,
                confidence=confidence,
                reasons=_collect_reasons(matches),
            )
        )

    return scores


def recommend_template(
    text: str,
    dictionary: dict | None = None,
    *,
    expected: str | None = None,
) -> Recommendation:
    """日本語文章から最適テンプレートを推定する。"""
    dictionary = dictionary or load_dictionary()
    parsed = extract_keywords(text, dictionary)
    scores = score_templates(parsed, dictionary)

    ranked = sorted(scores, key=lambda item: (-item.score, -item.confidence, item.template))
    best = ranked[0]

    if best.score <= 0:
        fallback = expected or "HOME_SECURITY"
        return Recommendation(
            template=fallback,
            confidence=0,
            reasons=[],
            scores=scores,
            parsed=parsed,
        )

    dominant = [item for item in ranked if item.score == best.score]
    if len(dominant) > 1 and expected and expected in {item.template for item in dominant}:
        best = next(item for item in dominant if item.template == expected)
    elif len(dominant) > 1:
        priority = {name: index for index, name in enumerate(VALID_TEMPLATES)}
        best = min(dominant, key=lambda item: priority[item.template])

    return Recommendation(
        template=best.template,
        confidence=best.confidence,
        reasons=best.reasons,
        scores=scores,
        parsed=parsed,
    )


def recommend_from_file(path: Path) -> Recommendation:
    text = path.read_text(encoding="utf-8")
    return recommend_template(text)


def validate_recommendation(recommendation: Recommendation, expected: str) -> bool:
    return recommendation.template == expected.upper()
