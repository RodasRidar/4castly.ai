"""Profile and preferences of the signed-in user."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import NotFoundError
from api.schemas import Company, Preferences, ProfileUpdate, User

_ENSURE_PROFILE = text(
    "insert into public.profiles (user_id, full_name) values (:user_id, :full_name) "
    "on conflict (user_id) do nothing"
)
_READ_USER = text(
    "select p.full_name, p.job_title, t.id as company_id, t.name as company_name "
    "from public.profiles p, public.tenants t "
    "where p.user_id = :user_id and t.id = :tenant_id"
)
_READ_PREFERENCES = text(
    "select theme, locale, time_zone, assistant_style from public.profiles where user_id = :user_id"
)
_UPDATE_PREFERENCES = text(
    "update public.profiles set theme = :theme, locale = :locale, time_zone = :time_zone, "
    "assistant_style = :assistant_style where user_id = :user_id"
)


async def _ensure_profile(session: AsyncSession, who: Principal) -> None:
    """Users are provisioned without a profile row; the first read creates it."""
    name = (who.email or "").split("@")[0]
    await session.execute(_ENSURE_PROFILE, {"user_id": who.user_id, "full_name": name})


async def get_me(session: AsyncSession, who: Principal) -> User:
    await _ensure_profile(session, who)
    row = (
        await session.execute(_READ_USER, {"user_id": who.user_id, "tenant_id": who.tenant_id})
    ).one_or_none()
    if row is None:
        raise NotFoundError
    return User(
        id=who.user_id,
        email=who.email or "",
        full_name=row.full_name,
        job_title=row.job_title,
        company=Company(id=row.company_id, name=row.company_name),
    )


async def update_me(session: AsyncSession, who: Principal, body: ProfileUpdate) -> User:
    await _ensure_profile(session, who)
    changes = body.model_dump(exclude_unset=True)
    # Column names come from the schema's own field names, never from the request.
    assignments = ", ".join(f"{column} = :{column}" for column in changes)
    await session.execute(
        text(f"update public.profiles set {assignments} where user_id = :user_id"),  # noqa: S608
        {**changes, "user_id": who.user_id},
    )
    return await get_me(session, who)


async def get_preferences(session: AsyncSession, who: Principal) -> Preferences:
    await _ensure_profile(session, who)
    row = (await session.execute(_READ_PREFERENCES, {"user_id": who.user_id})).one()
    return Preferences.model_validate(row._mapping)


async def update_preferences(
    session: AsyncSession, who: Principal, body: Preferences
) -> Preferences:
    await _ensure_profile(session, who)
    await session.execute(
        _UPDATE_PREFERENCES, {**body.model_dump(mode="json"), "user_id": who.user_id}
    )
    return body
