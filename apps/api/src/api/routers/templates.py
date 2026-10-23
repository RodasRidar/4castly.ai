"""`/v1/templates`: downloadable file templates."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from api.auth import get_principal
from api.routers._common import XLSX_MEDIA_TYPE, bearer_scheme, errors
from api.services.templates import sales_template

router = APIRouter(
    prefix="/v1/templates",
    tags=["templates"],
    dependencies=[Depends(bearer_scheme), Depends(get_principal)],
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
    return Response(
        sales_template(),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="sales-template.xlsx"'},
    )
