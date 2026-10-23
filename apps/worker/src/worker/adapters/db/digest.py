"""`DigestRepository` in PostgreSQL. Every statement filters by the claim's tenant."""

from __future__ import annotations

import json

from sqlalchemy import Engine, text

from worker.domain.documents import FileProfile, PlanDocument
from worker.domain.jobs import JobClaim
from worker.domain.results import UploadInfo


class SqlDigestRepository:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def load_upload(self, claim: JobClaim) -> UploadInfo | None:
        with self._engine.connect() as conn:
            row = conn.execute(
                text(
                    "select id, storage_path, file_name from public.uploads "
                    "where tenant_id = :t and conversation_id = :c "
                    "order by created_at desc limit 1"
                ),
                {"t": claim.tenant_id, "c": claim.conversation_id},
            ).one_or_none()
        return UploadInfo(row.id, row.storage_path, row.file_name) if row else None

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None:
        with self._engine.begin() as conn:
            self._stage(conn, claim, stage)

    @staticmethod
    def _stage(conn, claim: JobClaim, stage: str) -> None:  # noqa: ANN001 - SQLAlchemy Connection
        conn.execute(
            text(
                "update public.conversations set stage = :s, last_activity_at = now() "
                "where id = :c and tenant_id = :t"
            ),
            {"s": stage, "c": claim.conversation_id, "t": claim.tenant_id},
        )

    def save_digest(  # noqa: PLR0913 - one atomic write of everything the digest produced
        self,
        claim: JobClaim,
        upload: UploadInfo,
        *,
        profile: FileProfile,
        selected_sheet: str | None,
        document: PlanDocument,
        proposed_by: str,
        stage: str,
    ) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.uploads set profile = cast(:profile as jsonb), "
                    "sheets = :sheets, selected_sheet = :sheet, status = 'readable', "
                    "error_code = null where id = :u and tenant_id = :t"
                ),
                {
                    "profile": json.dumps(profile.to_dict()),
                    "sheets": [s.name for s in profile.sheets],
                    "sheet": selected_sheet,
                    "u": upload.upload_id,
                    "t": claim.tenant_id,
                },
            )
            conn.execute(
                text(
                    "delete from public.normalization_plans "
                    "where tenant_id = :t and upload_id = :u and confirmed_at is null"
                ),
                {"t": claim.tenant_id, "u": upload.upload_id},
            )
            conn.execute(
                text(
                    "insert into public.normalization_plans "
                    "(tenant_id, upload_id, plan, proposed_by) "
                    "values (:t, :u, cast(:plan as jsonb), :by)"
                ),
                {
                    "t": claim.tenant_id,
                    "u": upload.upload_id,
                    "plan": json.dumps(document.to_dict()),
                    "by": proposed_by,
                },
            )
            self._stage(conn, claim, stage)

    def mark_unreadable(self, claim: JobClaim, upload: UploadInfo, error_code: str) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.uploads set status = 'failed', error_code = :e "
                    "where id = :u and tenant_id = :t"
                ),
                {"e": error_code, "u": upload.upload_id, "t": claim.tenant_id},
            )
            self._stage(conn, claim, "unreadable")
