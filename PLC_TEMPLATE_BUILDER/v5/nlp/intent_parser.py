#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.2 — 日本語文章インテント解析
キーワード辞書に基づき、自然文からマッチ語句を抽出する。
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

NLP_DIR = Path(__file__).resolve().parent
DEFAULT_DICTIONARY = NLP_DIR / "keyword_dictionary.json"


@dataclass
class KeywordMatch:
    term: str
    label: str
    weight: int
    template: str


@dataclass
class ParsedIntent:
    raw_text: str
    normalized_text: str
    matches: list[KeywordMatch] = field(default_factory=list)
    matches_by_template: dict[str, list[KeywordMatch]] = field(default_factory=dict)

    @property
    def matched_labels(self) -> list[str]:
        seen: set[str] = set()
        labels: list[str] = []
        for match in self.matches:
            if match.label not in seen:
                seen.add(match.label)
                labels.append(match.label)
        return labels


def load_dictionary(path: Path | None = None) -> dict:
    dictionary_path = path or DEFAULT_DICTIONARY
    with dictionary_path.open(encoding="utf-8") as fh:
        return json.load(fh)


def normalize_text(text: str) -> str:
    """全角→半角、空白正規化、比較用に小文字化。"""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized.lower()


def extract_keywords(text: str, dictionary: dict | None = None) -> ParsedIntent:
    """日本語文章からキーワードを抽出し、テンプレート別に分類する。"""
    dictionary = dictionary or load_dictionary()
    normalized = normalize_text(text)
    matches: list[KeywordMatch] = []
    matches_by_template: dict[str, list[KeywordMatch]] = {}

    for template_name, template_data in dictionary["templates"].items():
        template_matches: list[KeywordMatch] = []
        for entry in template_data["keywords"]:
            term = entry["term"].lower()
            if term and term in normalized:
                match = KeywordMatch(
                    term=entry["term"],
                    label=entry.get("label", entry["term"]),
                    weight=int(entry.get("weight", 1)),
                    template=template_name,
                )
                matches.append(match)
                template_matches.append(match)
        if template_matches:
            matches_by_template[template_name] = template_matches

    return ParsedIntent(
        raw_text=text,
        normalized_text=normalized,
        matches=matches,
        matches_by_template=matches_by_template,
    )


def parse_sample_requests(path: Path) -> list[tuple[str, str]]:
    """
    sample_requests.txt を読み込む。
    形式:
      === TEMPLATE_NAME ===
      日本語文章...
    """
    if not path.is_file():
        raise FileNotFoundError(f"サンプル要求ファイルが見つかりません: {path}")

    content = path.read_text(encoding="utf-8")
    blocks = re.split(r"^===\s*([A-Z_]+)\s*===\s*$", content, flags=re.MULTILINE)
    samples: list[tuple[str, str]] = []

    if len(blocks) < 3:
        return samples

    for index in range(1, len(blocks), 2):
        template_name = blocks[index].strip()
        body = blocks[index + 1].strip()
        lines = [line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("#")]
        request_text = "\n".join(lines).strip()
        if request_text:
            samples.append((template_name, request_text))

    return samples
