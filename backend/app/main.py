"""TideWatch FastAPI 入口。"""
from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api import routes_auth, routes_health, routes_stream
from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    unexpected_error_handler,
)
from app.core.logging import configure_logging, get_logger
from app.realtime.hub import hub

configure_logging()
logger = get_logger("main")


def create_app() -> FastAPI:
    import asyncio
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        hub.bind_loop(asyncio.get_running_loop())
        logger.info("stream hub bound to event loop")
        yield

    app = FastAPI(
        title="TideWatch API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001
            return unexpected_error_handler(request, exc)

    # 统一错误结构
    app.add_exception_handler(AppError, app_error_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION_FAILED",
                "message": "请求参数校验失败",
                "details": exc.errors(),
                "requestId": getattr(request.state, "request_id", None),
            },
        )

    app.include_router(routes_health.router)
    app.include_router(routes_auth.router)
    app.include_router(routes_stream.router)

    @app.get("/")
    def root() -> dict:
        return {"name": "TideWatch API", "version": __version__}

    return app


app = create_app()
