from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable
from uuid import UUID

from worker.domain.documents import FileProfile, PlanDocument
from worker.domain.jobs import JobClaim
from worker.domain.results import ProductDemand, ProductOverride, RunResult, UploadInfo


@runtime_checkable
class DigestRepository(Protocol):
    """Persistence of the digest job. Every method is scoped by the claim's tenant."""

    def load_upload(self, claim: JobClaim) -> UploadInfo | None: ...

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None: ...

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
        """Upload profile, the proposed plan and the conversation stage, in one transaction."""
        ...

    def mark_unreadable(self, claim: JobClaim, upload: UploadInfo, error_code: str) -> None: ...


@runtime_checkable
class RunRepository(Protocol):
    """Persistence of the forecast job."""

    def load_confirmed(self, claim: JobClaim) -> tuple[UploadInfo, PlanDocument] | None:
        """The upload and the plan the user confirmed, or None."""
        ...

    def load_overrides(self, claim: JobClaim) -> dict[str, ProductOverride]: ...

    def run_exists_for_job(self, claim: JobClaim) -> bool: ...

    def save_demand(
        self, claim: JobClaim, upload: UploadInfo, products: Sequence[ProductDemand]
    ) -> None:
        """Upsert products and replace this upload's demand series."""
        ...

    def load_demand(self, claim: JobClaim) -> list[ProductDemand]:
        """The stored demand with the stock of the latest ready run (recalculation)."""
        ...

    def publish_run(self, claim: JobClaim, result: RunResult) -> UUID:
        """Run, forecasts, metrics, supersede the previous run, conversation -> ready: one
        transaction, so a run is never visible half built."""
        ...

    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None: ...

    def run_params(self, claim: JobClaim) -> dict[str, Any] | None:
        """Parameters of the conversation's latest ready run (recalculation defaults)."""
        ...
