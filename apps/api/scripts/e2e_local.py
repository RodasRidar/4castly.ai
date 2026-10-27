"""End to end on this machine, no Docker and no hosted services.

    make e2e-local            # or: cd apps/api && uv run python scripts/e2e_local.py

An ephemeral PostgreSQL gets the real migrations; the real API (real JWT verification and RLS) runs
in process and the real worker runs inline instead of Modal. Only storage is a local directory and
the token key is generated here. Two synthetic files go the whole way: a Kardex and a tabular CSV.
The assistant step runs only when ANTHROPIC_API_KEY is set. Exit code 0 means every step passed.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pgtest
import psycopg
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from synthetic import write_kardex, write_sales_csv

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "apps" / "api" / "tests"))

from worker.adapters.forecasting import StatsForecastBaseline  # noqa: E402
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer  # noqa: E402
from worker.adapters.storage.local import LocalFileStore  # noqa: E402
from worker.bootstrap import Worker  # noqa: E402

from api.adapters.jwks import JwksTokenVerifier  # noqa: E402
from api.main import create_app  # noqa: E402
from api.ports.storage import SignedDownload, SignedUpload, StoredObject  # noqa: E402
from api.settings import Settings  # noqa: E402
from authn.keys import AUDIENCE, ISSUER, TestKey, jwks  # noqa: E402

CONTENT_TYPES = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
}


class StepError(Exception):
    """A step did not give the expected result."""


def say(message: str) -> None:
    sys.stdout.write(f"{message}\n")


def expect(condition: object, message: str) -> None:
    if not condition:
        raise StepError(message)


class LocalStorage:
    """The API's `ObjectStorage` over a directory: the 'browser' writes the file straight to it."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.last_path = ""

    async def create_upload_url(self, path: str, content_type: str) -> SignedUpload:
        self.last_path = path
        expires = datetime.now(UTC) + timedelta(hours=1)
        return SignedUpload(f"http://storage.local/{path}", {"Content-Type": content_type}, expires)

    async def stat(self, path: str) -> StoredObject | None:
        target = self.root / path
        if not target.is_file():
            return None
        return StoredObject(target.stat().st_size, target.read_bytes()[:8192])

    async def create_download_url(self, path: str, *, ttl_seconds: int = 60) -> SignedDownload:
        return SignedDownload(f"http://storage.local/{path}", datetime.now(UTC))

    async def put(self, path: str, data: bytes, content_type: str) -> None:
        del content_type
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


class InlineSpawner:
    """Runs the worker function where Modal would, before the request returns."""

    def __init__(self, worker: Worker) -> None:
        self.worker = worker

    async def spawn(self, kind: str, job_id: UUID) -> None:
        run = self.worker.run_digest if kind == "digest" else self.worker.run_forecast
        await asyncio.to_thread(run, job_id)


def seed_tenant(dsn: str, email: str) -> tuple[UUID, UUID]:
    tenant, user = uuid4(), uuid4()
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute("insert into public.tenants (id, name) values (%s, 'E2E local')", [tenant])
        admin.execute("insert into auth.users (id, email) values (%s, %s)", [user, email])
        admin.execute(
            "insert into public.tenant_members (tenant_id, user_id, role) values (%s, %s, 'owner')",
            [tenant, user],
        )
        admin.execute(
            "insert into public.allowed_emails (tenant_id, email) values (%s, %s)", [tenant, email]
        )
        admin.execute("insert into public.profiles (user_id, full_name) values (%s, 'E2E')", [user])
    return tenant, user


class Session:
    def __init__(self, client: TestClient, headers: dict[str, str], storage: LocalStorage) -> None:
        self.client, self.headers, self.storage = client, headers, storage

    def call(self, method: str, path: str, ok: int = 200, **kwargs: Any) -> Any:
        response = self.client.request(method, path, headers=self.headers, **kwargs)
        expect(
            response.status_code == ok, f"{method} {path}: {response.status_code} {response.text}"
        )
        return response.json()

    def upload(self, file: Path) -> dict[str, Any]:
        body = {
            "file_name": file.name,
            "size_bytes": file.stat().st_size,
            "content_type": CONTENT_TYPES[file.suffix],
        }
        ticket = self.call("POST", "/v1/uploads", 201, json=body)
        target = self.storage.root / self.storage.last_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file.read_bytes())
        return self.call("POST", f"/v1/uploads/{ticket['upload_id']}/complete", 201)


def run_file(session: Session, file: Path) -> None:
    say(f"\n== {file.name}")
    accepted = session.upload(file)
    conversation = accepted["conversation_id"]
    job = session.call("GET", f"/v1/jobs/{accepted['job_id']}")
    expect(job["status"] == "succeeded", f"digest: {job['status']}")
    say(f"digest: {job['status']}")
    path = f"/v1/conversations/{conversation}"
    expect(session.call("GET", path)["stage"] == "awaiting_confirmation", "stage after digest")
    plan = session.call("GET", f"{path}/plan")
    say(f"plan: {plan['source_kind']}, {plan['summary']}")
    session.call("PUT", f"{path}/plan", json={})
    stage = session.call("GET", path)["stage"]
    expect(stage == "clarifying", f"stage after confirming: {stage}")
    started = session.call("POST", f"{path}/forecast", 202, json={"skip": True})
    job = session.call("GET", f"/v1/jobs/{started['job_id']}")
    expect(job["status"] == "succeeded", f"forecast: {job['status']} {job}")
    detail = session.call("GET", path)
    expect(detail["stage"] == "ready" and detail["current_run_id"], f"stage {detail['stage']}")
    run = detail["current_run_id"]
    summary = session.call("GET", f"/v1/runs/{run}/summary")
    products = session.call("GET", f"/v1/runs/{run}/products")
    expect(products["total"] == 3, f"products: {products['total']}")
    say(f"summary: {summary['total_products']} products, stock known: {summary['stock_known']}")
    code = products["items"][0]["code"]
    session.call("GET", f"/v1/runs/{run}/products/{code}")
    say(f"product detail: {code} ok")
    if os.environ.get("ANTHROPIC_API_KEY"):
        with session.client.stream(
            "POST",
            f"{path}/messages",
            json={"text": "¿Cuántos productos están en riesgo crítico?"},
            headers=session.headers,
        ) as response:
            expect(response.status_code == 200, f"chat: {response.status_code}")
            text = "".join(response.iter_lines())
        expect("event: message.end" in text, "chat did not finish")
        say("chat: answered")
    else:
        say("chat: skipped (no ANTHROPIC_API_KEY)")


def main() -> int:
    os.environ.setdefault("LOG_LEVEL", "WARNING")  # the steps below are the output
    key = TestKey("e2e-local")
    with tempfile.TemporaryDirectory(prefix="e2e-local-") as tmp:
        root = Path(tmp)
        data = root / "pg"
        data.mkdir()
        dsn, stop = pgtest.start_cluster(data)
        try:
            pgtest.install_schema(dsn, REPO / "supabase" / "migrations")
            with psycopg.connect(dsn, autocommit=True) as admin:
                admin.execute("alter role app_api login password 'test'")
                admin.execute("alter role app_worker login password 'test'")
            tenant, user = seed_tenant(dsn, "dev@local.test")
            engine = create_engine(
                pgtest.sqlalchemy_url(dsn, driver="psycopg", user="app_worker", password="test")
            )
            storage = LocalStorage(root / "storage")
            worker = Worker(
                engine,
                store=LocalFileStore(storage.root),
                proposer=DeterministicPlanProposer(),
                forecaster=StatsForecastBaseline("auto_ets", season_length=1),
            )

            async def fetch(_url: str) -> dict[str, Any]:
                return jwks(key)

            verifier = JwksTokenVerifier(
                jwks_url="http://jwks.local/keys", issuer=ISSUER, audience=AUDIENCE, fetch=fetch
            )
            api_url = pgtest.sqlalchemy_url(dsn, driver="asyncpg", user="app_api", password="test")
            settings = Settings(
                database_url=api_url,
                supabase_url="http://127.0.0.1:54321",
                anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            )
            app = create_app(
                settings, verifier=verifier, storage=storage, spawner=InlineSpawner(worker)
            )
            with TestClient(app) as client:
                token = key.token({"sub": str(user), "email": "dev@local.test"})
                session = Session(client, {"Authorization": f"Bearer {token}"}, storage)
                say(f"me: {session.call('GET', '/v1/me')['email']} (tenant {tenant})")
                files = root / "files"
                files.mkdir()
                for file in (
                    write_kardex(files / "kardex.xlsx"),
                    write_sales_csv(files / "ventas.csv"),
                ):
                    run_file(session, file)
            engine.dispose()
        except StepError as error:
            say(f"\nFAILED: {error}")
            return 1
        finally:
            stop()
    say("\nOK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
