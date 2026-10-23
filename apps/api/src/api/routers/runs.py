"""`/v1/runs`: results, portfolio table, product detail, simulation, parameters and exports."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from api.auth import CurrentTx
from api.domain.errors import NotImplementedYetError
from api.routers._common import bearer_scheme, errors
from api.schemas import (
    AbcClass,
    ExportFile,
    ExportRequest,
    JobAccepted,
    ProductDetail,
    ProductPage,
    ProductSort,
    RiskLevel,
    RunParameters,
    RunSummary,
    SimulationRequest,
    SimulationResult,
    SortOrder,
)
from api.services import run_product_detail, run_products, runs

router = APIRouter(
    prefix="/v1/runs", tags=["runs"], dependencies=[Depends(bearer_scheme)], responses=errors()
)

ProductCode = Annotated[str, Path(min_length=1, max_length=64)]


@router.get("/{run_id}/summary", responses=errors(404, 422))
async def get_run_summary(run_id: UUID, tx: CurrentTx) -> RunSummary:
    """KPIs, risk distribution, aggregate series, defaults used and staleness."""
    return await tx.run(runs.get_summary, run_id)


@router.get("/{run_id}/products", responses=errors(404, 422))
async def list_run_products(
    run_id: UUID,
    q: Annotated[str | None, Query(max_length=120)] = None,
    risk: Annotated[list[RiskLevel] | None, Query(max_length=3)] = None,
    abc: Annotated[list[AbcClass] | None, Query(max_length=3)] = None,
    sort: ProductSort = ProductSort.RISK,
    order: SortOrder = SortOrder.ASC,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    *,
    tx: CurrentTx,
) -> ProductPage:
    """Paginated, filtered table. `q` matches code and name ignoring accents and case."""
    return await tx.run(
        run_products.list_products, run_id, q, risk, abc, sort, order, page, page_size
    )


@router.get("/{run_id}/products/{code}", responses=errors(404, 422))
async def get_run_product(run_id: UUID, code: ProductCode, tx: CurrentTx) -> ProductDetail:
    """Cards, weekly table and series, without and with the suggested purchase."""
    return await tx.run(run_product_detail.get_detail, run_id, code)


@router.post("/{run_id}/products/{code}/simulate", responses=errors(404, 422))
async def simulate_product(
    run_id: UUID, code: ProductCode, body: SimulationRequest, tx: CurrentTx
) -> SimulationResult:
    """What-if on lead time, target coverage or purchase. Uses the formulas on the persisted
    forecast; nothing is re-forecast or saved."""
    return await tx.run(run_product_detail.simulate, run_id, code, body)


@router.put("/{run_id}/parameters", responses=errors(404, 409, 422))
async def update_run_parameters(run_id: UUID, body: RunParameters) -> RunParameters:
    """Save the drawer values; they apply on the next `recalculate`."""
    raise NotImplementedYetError


@router.post("/{run_id}/recalculate", status_code=202, responses=errors(404, 409, 422))
async def recalculate_run(run_id: UUID) -> JobAccepted:
    """Build a new run with the saved parameters; the previous one becomes superseded."""
    raise NotImplementedYetError


@router.post("/{run_id}/exports", status_code=201, responses=errors(404, 422))
async def create_export(run_id: UUID, body: ExportRequest) -> ExportFile:
    """Excel export of everything, a selection or one product."""
    raise NotImplementedYetError
