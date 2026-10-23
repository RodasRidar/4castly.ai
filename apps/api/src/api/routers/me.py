"""`/v1/me`: profile and preferences."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.auth import CurrentTx
from api.routers._common import bearer_scheme, errors
from api.schemas import Preferences, ProfileUpdate, User
from api.services import me

router = APIRouter(
    prefix="/v1/me", tags=["me"], dependencies=[Depends(bearer_scheme)], responses=errors()
)


@router.get("")
async def get_me(tx: CurrentTx) -> User:
    """The signed-in user, profile and company."""
    return await tx.run(me.get_me)


@router.patch("", responses=errors(422))
async def update_me(body: ProfileUpdate, tx: CurrentTx) -> User:
    """Edit name and job title. Email and company are read-only."""
    return await tx.run(me.update_me, body)


@router.get("/preferences")
async def get_preferences(tx: CurrentTx) -> Preferences:
    return await tx.run(me.get_preferences)


@router.put("/preferences", responses=errors(422))
async def update_preferences(body: Preferences, tx: CurrentTx) -> Preferences:
    """Theme, language, time zone and assistant style (autosaved by the web app)."""
    return await tx.run(me.update_preferences, body)
