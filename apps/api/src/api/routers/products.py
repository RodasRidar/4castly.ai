"""`/v1/products`: per-product settings that outlive a run."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from api.domain.errors import NotImplementedYetError
from api.routers._common import bearer_scheme, errors
from api.schemas import ProductOverrides

router = APIRouter(
    prefix="/v1/products",
    tags=["products"],
    dependencies=[Depends(bearer_scheme)],
    responses=errors(),
)


@router.put("/{code}/overrides", responses=errors(404, 422))
async def update_product_overrides(
    code: Annotated[str, Path(min_length=1, max_length=64)], body: ProductOverrides
) -> ProductOverrides:
    """Per-product lead time, target coverage and quantity on order. `null` clears a value.
    Results change after the next recalculation or simulation."""
    raise NotImplementedYetError
