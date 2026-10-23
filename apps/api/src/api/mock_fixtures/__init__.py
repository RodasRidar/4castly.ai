"""Mock fixtures for the web app, generated from the formulas package through the contract.

Everything goes through the Pydantic schemas, so a fixture cannot drift from the contract.

    uv run python -m api.mock_fixtures --out ../web/src/services/mock/fixtures
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from api.mock_fixtures import chat, flow, run

COMPACT_FILES = {"run-product-details.json"}
"""Large files are written without indentation to stay under the repo's large-file hook."""


def build_fixtures() -> dict[str, Any]:
    """File name -> JSON-native content, in the shapes the API returns."""
    items = run.build_products()
    events, text = chat.stream_example(items)
    return {
        "session.json": flow.session(),
        "conversations.json": flow.conversations(),
        "entry-flow.json": flow.entry_flow(),
        "run-summary.json": run.to_summary(items).model_dump(mode="json"),
        "run-products.json": {"items": [run.to_row(i).model_dump(mode="json") for i in items]},
        "run-product-details.json": {
            i.code: run.to_detail(i).model_dump(mode="json") for i in items
        },
        "chat.json": {
            "messages": [m.model_dump(mode="json") for m in chat.messages(items)],
            "stream_example": [_dump(e) for e in events],
            "stream_example_text": text,
        },
        "errors.json": flow.errors(),
    }


def _dump(model: object) -> Any:
    return model.model_dump(mode="json")  # ty: ignore[unresolved-attribute]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the web mock fixtures.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    for name, content in build_fixtures().items():
        indent = None if name in COMPACT_FILES else 1
        separators = (",", ":") if indent is None else None
        text = json.dumps(content, indent=indent, separators=separators, ensure_ascii=False)
        (args.out / name).write_text(text + "\n", encoding="utf-8")
    sys.stdout.write(f"wrote {len(build_fixtures())} fixture files to {args.out}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
