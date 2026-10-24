from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import replace

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.adapters.anthropic_agent import build_agent
from api.adapters.jwks import JwksTokenVerifier
from api.adapters.modal_spawner import ModalJobSpawner
from api.adapters.supabase_storage import SupabaseStorage
from api.assistant.prompt import SYSTEM_PROMPT
from api.container import Container
from api.db.engine import create_engine
from api.errors import register_exception_handlers
from api.observability.logging import configure_logging
from api.observability.middleware import (
    AccessLogMiddleware,
    BodySizeLimitMiddleware,
    RequestIdMiddleware,
)
from api.observability.tracing import configure_tracing
from api.openapi import install_openapi
from api.ports.assistant import AssistantAgent
from api.ports.auth import TokenVerifier
from api.ports.jobs import JobSpawner
from api.ports.storage import ObjectStorage
from api.routers import (
    conversations,
    health,
    jobs,
    me,
    messages,
    products,
    runs,
    templates,
    uploads,
)
from api.services.assistant_tools import TOOL_SPECS
from api.settings import Settings, get_settings

V1_ROUTERS = (me, conversations, uploads, templates, jobs, runs, products, messages)


def create_app(
    settings: Settings | None = None,
    *,
    verifier: TokenVerifier | None = None,
    storage: ObjectStorage | None = None,
    spawner: JobSpawner | None = None,
    agent: AssistantAgent | None = None,
) -> FastAPI:
    """Build the app. The keyword arguments replace adapters (tests inject fakes)."""
    settings = settings or get_settings()
    configure_logging(settings)

    container = Container(
        engine=None,
        verifier=verifier
        or JwksTokenVerifier(
            jwks_url=settings.resolved_jwks_url,
            issuer=settings.resolved_jwt_issuer,
            audience=settings.jwt_audience,
        ),
        storage=storage
        or SupabaseStorage(
            base_url=settings.supabase_url,
            service_key=settings.supabase_service_role_key,
            bucket=settings.storage_bucket,
        ),
        spawner=spawner
        or ModalJobSpawner(
            app_name=settings.modal_app_name, environment=settings.modal_environment
        ),
        agent=agent
        or build_agent(settings.anthropic_api_key, system=SYSTEM_PROMPT, tools=TOOL_SPECS),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        engine = (
            create_engine(settings.database_url, pool_size=settings.db_pool_size)
            if settings.database_url
            else None
        )
        app.state.engine = engine
        app.state.container = replace(container, engine=engine)
        try:
            yield
        finally:
            if engine is not None:
                await engine.dispose()
            if app.state.tracer_provider is not None:
                app.state.tracer_provider.shutdown()

    app = FastAPI(
        lifespan=lifespan,
        title="4castly.ai API",
        version="0.1.0",
        description="Demand and stock forecasting. The Pydantic schemas are the contract.",
        separate_input_output_schemas=False,
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.container = container  # replaced by the lifespan once the engine exists
    register_exception_handlers(app)
    app.include_router(health.router)
    for module in V1_ROUTERS:
        app.include_router(module.router)
    install_openapi(app)

    # Last added runs first: CORS, request id, tracing, access log, then the size limit.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(AccessLogMiddleware)
    app.state.tracer_provider = configure_tracing(settings, app)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    return app


app = create_app()
