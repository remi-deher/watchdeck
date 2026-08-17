"""Traduction HTTP centralisée des erreurs métier."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .errors import (
    ConfigurationError,
    ConflictError,
    DomainError,
    IntegrationUnavailableError,
    ResourceNotFoundError,
    ValidationError,
)

STATUS_BY_ERROR: dict[type[DomainError], int] = {
    ValidationError: 400,
    ConfigurationError: 400,
    ResourceNotFoundError: 404,
    ConflictError: 409,
    IntegrationUnavailableError: 502,
}


def register_domain_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        status_code = next((status for error_type, status in STATUS_BY_ERROR.items() if isinstance(exc, error_type)), 400)
        return JSONResponse(status_code=status_code, content={"detail": exc.message})
