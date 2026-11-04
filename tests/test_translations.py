"""Guard translation placeholders used by Home Assistant's ICU formatter."""
from __future__ import annotations

import json
import re
from pathlib import Path

TRANSLATION_FILES = (
    "strings.json",
    "translations/en.json",
    "translations/fr.json",
)
DOMAIN_DIR = Path(__file__).resolve().parents[1] / "custom_components" / "tracearr_ha"
PLACEHOLDER = re.compile(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}")


def _strings(data):
    if isinstance(data, dict):
        for value in data.values():
            yield from _strings(value)
    elif isinstance(data, list):
        for value in data:
            yield from _strings(value)
    elif isinstance(data, str):
        yield data


def test_translations_have_only_valid_placeholders():
    for filename in TRANSLATION_FILES:
        contents = json.loads((DOMAIN_DIR / filename).read_text(encoding="utf-8"))
        for value in _strings(contents):
            cleaned = PLACEHOLDER.sub("", value)
            assert "{" not in cleaned and "}" not in cleaned, (filename, value)
