"""`python -m api.export_openapi` writes the committed OpenAPI document deterministically."""

import json
from pathlib import Path

from api.export_openapi import main
from api.main import create_app


def test_export_writes_the_application_spec(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    assert main(["--out", str(target)]) == 0

    assert json.loads(target.read_text(encoding="utf-8")) == create_app().openapi()


def test_export_is_idempotent_and_ends_with_a_newline(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "openapi.json"
    main(["--out", str(target)])
    first = target.read_text(encoding="utf-8")

    main(["--out", str(target)])

    assert target.read_text(encoding="utf-8") == first
    assert first.endswith("}\n")
