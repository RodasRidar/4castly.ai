"""Local seed: a tenant, its owner and synthetic sales files to upload.

    cd apps/api && uv run python scripts/seed_local.py

Provisions through `api.provisioning` (idempotent, so repeating it is safe) against the database and
Supabase Auth named in the environment (see `.env.local.example`), then writes the files into
`<repo>/.local/` (ignored by git).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from synthetic import write_kardex, write_sales_csv

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / ".local"
EMAIL = os.environ.get("SEED_EMAIL", "dev@local.test")
TENANT = os.environ.get("SEED_TENANT", "Demo Local")


def main() -> int:
    OUT.mkdir(exist_ok=True)
    kardex, csv = write_kardex(OUT / "kardex-demo.xlsx"), write_sales_csv(OUT / "ventas-demo.csv")
    command = [sys.executable, "-m", "api.provisioning", "--tenant", TENANT, "--email", EMAIL]
    result = subprocess.run(command, check=False)  # noqa: S603 - fixed arguments
    if result.returncode:
        return result.returncode
    sys.stdout.write(f"Sign in as {EMAIL}. Synthetic files:\n  {kardex}\n  {csv}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
