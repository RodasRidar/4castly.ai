"""Profile and preferences (`/me`)."""

from __future__ import annotations

from typing import Self
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator, model_validator

from api.schemas.base import ApiModel, RequestModel
from api.schemas.enums import AssistantStyle, Locale, Theme


class Company(ApiModel):
    id: UUID
    name: str


class User(ApiModel):
    id: UUID
    email: str
    """Read-only: comes from the identity provider."""
    full_name: str
    job_title: str | None
    company: Company
    """Read-only: the tenant the user belongs to (one tenant per user in v1)."""


class ProfileUpdate(RequestModel):
    """PATCH semantics: omitted fields stay, `null` clears `job_title`."""

    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _needs_a_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send at least one field to update")
        return self


class Preferences(RequestModel):
    """PUT replaces the whole object. Also used as the response."""

    theme: Theme
    locale: Locale
    time_zone: str = Field(min_length=1, max_length=64)
    """IANA name, for example `America/Lima`."""
    assistant_style: AssistantStyle

    @field_validator("time_zone")
    @classmethod
    def _known_time_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("unknown IANA time zone") from error
        return value
