import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.error_handlers import register_domain_exception_handlers
from app.errors import (
    ConfigurationError,
    ConflictError,
    DomainError,
    IntegrationUnavailableError,
    ResourceNotFoundError,
    ValidationError,
)


@pytest.mark.parametrize(
    ("error_type", "status_code"),
    [
        (ValidationError, 400),
        (ConfigurationError, 400),
        (ResourceNotFoundError, 404),
        (ConflictError, 409),
        (IntegrationUnavailableError, 502),
        (DomainError, 400),
    ],
)
def test_domain_errors_keep_the_standard_api_error_contract(error_type, status_code):
    app = FastAPI()
    register_domain_exception_handlers(app)

    @app.get("/failure")
    async def failure():
        raise error_type("Message contrôlé")

    response = TestClient(app, raise_server_exceptions=False).get("/failure")
    assert response.status_code == status_code
    assert response.json() == {"detail": "Message contrôlé"}
