"""TideWatch FastAPI 入口。"""
from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api import (
    routes_admin,
    routes_auth,
    routes_events,
    routes_health,
    routes_import,
    routes_reaches,
    routes_stream,
)
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
        import asyncio

        hub.bind_loop(asyncio.get_running_loop())
        logger.info("stream hub bound to event loop")

        # MQTT 入库服务（默认关闭，.env 中 MQTT_ENABLED=true 启用）
        mqtt_ingestor = None
        watchdog_stop: asyncio.Event | None = None
        watchdog_task = None
        if settings.mqtt_enabled:
            from app.ingestion.mqtt_ingestor import MqttIngestor, freshness_watchdog

            mqtt_ingestor = MqttIngestor()
            mqtt_ingestor.start()
            watchdog_stop = asyncio.Event()
            watchdog_task = asyncio.create_task(freshness_watchdog(watchdog_stop))

            # 从历史观测重建变化检测器状态（重建期不产生新事件）
            from app.db.session import SessionLocal
            from app.services.event_service import processor

            db = SessionLocal()
            try:
                processor.rebuild_from_history(db)
            finally:
                db.close()
            logger.info("MQTT ingestor enabled")

        try:
            yield
        finally:
            if watchdog_stop is not None:
                watchdog_stop.set()
            if watchdog_task is not None:
                await watchdog_task
            if mqtt_ingestor is not None:
                mqtt_ingestor.stop()

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
    app.include_router(routes_reaches.router)
    app.include_router(routes_events.router)
    app.include_router(routes_import.router)
    app.include_router(routes_admin.router)
    app.include_router(routes_stream.router)

    @app.get("/")
    def root() -> dict:
        return {"name": "TideWatch API", "version": __version__}

    return app


app = create_app()
