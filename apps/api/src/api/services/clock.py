"""The user's calendar: "today" and the sidebar's week boundary follow their time zone."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal

DEFAULT_TIME_ZONE = "America/Lima"
_TIME_ZONE = text("select time_zone from public.profiles where user_id = :user_id")


class UserClock:
    def __init__(self, zone: str) -> None:
        try:
            tz = ZoneInfo(zone)
        except (KeyError, ValueError):
            tz = ZoneInfo(DEFAULT_TIME_ZONE)
        start = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        self.today_start = start
        self.week_start = start - timedelta(days=6)

    @property
    def today(self) -> date:
        return self.today_start.date()


async def user_clock(session: AsyncSession, who: Principal) -> UserClock:
    zone = (await session.execute(_TIME_ZONE, {"user_id": who.user_id})).scalar_one_or_none()
    return UserClock(zone or DEFAULT_TIME_ZONE)
