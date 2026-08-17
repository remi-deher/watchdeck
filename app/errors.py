"""Erreurs métier indépendantes du transport HTTP."""


class DomainError(Exception):
    """Erreur attendue qu'une interface (HTTP, tâche, CLI) peut traduire."""

    default_message = "Erreur métier"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class ValidationError(DomainError):
    default_message = "Données invalides"


class ResourceNotFoundError(DomainError):
    default_message = "Ressource introuvable"


class ConflictError(DomainError):
    default_message = "Conflit avec l'état actuel"


class ConfigurationError(DomainError):
    default_message = "Configuration incomplète"


class IntegrationUnavailableError(DomainError):
    default_message = "Service externe indisponible"
