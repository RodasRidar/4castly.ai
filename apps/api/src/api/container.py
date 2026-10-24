"""What the services need from the outside world, built once at startup and swappable in tests."""

from __future__ import annotations

from dataclasses import dataclass, field

from opentelemetry import trace
from opentelemetry.trace import Tracer
from sqlalchemy.ext.asyncio import AsyncEngine

from api.ports.assistant import AssistantAgent
from api.ports.auth import TokenVerifier
from api.ports.feedback import FeedbackScores, NullScores
from api.ports.jobs import JobSpawner
from api.ports.storage import ObjectStorage


@dataclass(frozen=True)
class Container:
    engine: AsyncEngine | None
    verifier: TokenVerifier
    storage: ObjectStorage
    spawner: JobSpawner
    agent: AssistantAgent
    scores: FeedbackScores = field(default_factory=NullScores)
    tracer: Tracer = field(default_factory=trace.NoOpTracer)
