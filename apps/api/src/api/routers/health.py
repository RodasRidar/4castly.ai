from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from api.domain.errors import UnavailableError
from api.schemas import ApiError

router = APIRouter(tags=["health"])


@router.get("/health/live")
def live() -> dict[str, str]:
    """The process is up. Never touches the database."""
    return {"status": "ok"}


@router.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Kept for existing probes; same answer as `/health/live`."""
    return {"status": "ok"}


@router.get("/health/ready", responses={503: {"model": ApiError, "description": "Database down."}})
async def ready(request: Request) -> dict[str, str]:
    """The database answers. A failing check lets the platform route away or restart (R9)."""
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise UnavailableError
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
    except (SQLAlchemyError, OSError) as error:
        raise UnavailableError from error
    return {"status": "ready"}
