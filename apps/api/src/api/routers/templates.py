"""`/v1/templates`: downloadable file templates."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from api.domain.errors import NotImplementedYetError
from api.routers._common import XLSX_MEDIA_TYPE, bearer_scheme, errors

router = APIRouter(
    prefix="/v1/templates",
    tags=["templates"],
    dependencies=[Depends(bearer_scheme)],
    responses=errors(),
)


@router.get(
    "/sales.xlsx",
    response_class=Response,
    responses={
        200: {
            "description": "The sales template, generated with openpyxl at request time.",
            "content": {XLSX_MEDIA_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def download_sales_template() -> Response:
    raise NotImplementedYetError
