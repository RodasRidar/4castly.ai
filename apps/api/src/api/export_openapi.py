"""Write the OpenAPI document that `schema.gen.ts` is generated from.

uv run python -m api.export_openapi --out openapi.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from api.main import create_app


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export the OpenAPI document.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    document = json.dumps(create_app().openapi(), indent=2, ensure_ascii=False)
    args.out.write_text(document + "\n", encoding="utf-8")
    sys.stdout.write(f"wrote {args.out}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
