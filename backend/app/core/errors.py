"""统一错误结构（GRP 7.4）：{code, message, details, requestId}。"""
from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    def __init__(self, resource: str, key: str) -> None:
        super().__init__("NOT_FOUND", f"{resource} 不存在: {key}", 404)


class ConflictError(AppError):
    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__("STATE_CONFLICT", message, 409, details)


class ValidationAppError(AppError):
    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__("VALIDATION_FAILED", message, 422, details)


def _body(code: str, message: str, details: Any, request: Request | None) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "details": details,
        "requestId": getattr(request.state, "request_id", None) if request else None,
    }


def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_body(exc.code, exc.message, exc.details, request),
    )


def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_body("INTERNAL_ERROR", "服务内部错误", None, request),
    )
