from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db.engine import create_engine
from api.errors import register_exception_handlers
from api.openapi import install_openapi
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
from api.settings import Settings, get_settings

V1_ROUTERS = (me, conversations, uploads, templates, jobs, runs, products, messages)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        engine = (
            create_engine(settings.database_url, pool_size=settings.db_pool_size)
            if settings.database_url
            else None
        )
        app.state.engine = engine
        try:
            yield
        finally:
            if engine is not None:
                await engine.dispose()

    app = FastAPI(
        lifespan=lifespan,
        title="4castly.ai API",
        version="0.1.0",
        description="Demand and stock forecasting. The Pydantic schemas are the contract.",
        separate_input_output_schemas=False,
        generate_unique_id_function=lambda route: route.name,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(health.router)
    for module in V1_ROUTERS:
        app.include_router(module.router)
    install_openapi(app)
    return app


app = create_app()
