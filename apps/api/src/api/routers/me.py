"""`/v1/me`: profile and preferences."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.domain.errors import NotImplementedYetError
from api.routers._common import bearer_scheme, errors
from api.schemas import Preferences, ProfileUpdate, User

router = APIRouter(
    prefix="/v1/me", tags=["me"], dependencies=[Depends(bearer_scheme)], responses=errors()
)


@router.get("")
async def get_me() -> User:
    """The signed-in user, profile and company."""
    raise NotImplementedYetError


@router.patch("", responses=errors(422))
async def update_me(body: ProfileUpdate) -> User:
    """Edit name and job title. Email and company are read-only."""
    raise NotImplementedYetError


@router.get("/preferences")
async def get_preferences() -> Preferences:
    raise NotImplementedYetError


@router.put("/preferences", responses=errors(422))
async def update_preferences(body: Preferences) -> Preferences:
    """Theme, language, time zone and assistant style (autosaved by the web app)."""
    raise NotImplementedYetError
