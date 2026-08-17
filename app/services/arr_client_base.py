"""Client de base orienté objet pour les API Servarr v3 (Sonarr et Radarr).

Factorise la gestion de la connexion HTTP, des profils de qualité,
des dossiers racines, des tags, de l'espace disque, et des opérations communes.
"""

from typing import Any

from . import arr_common
from .arr_http_client import ArrClient


class BaseArrClient:
    """Client orienté objet encapsulant les appels API v3 partagés."""

    def __init__(self, url: str, api_key: str, product: str = "Servarr", timeout: float = 15.0):
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.product = product
        self.timeout = timeout

    def http_client(self) -> ArrClient:
        """Instancie un ArrClient configuré pour ce serveur."""
        return ArrClient(self.url, self.api_key, timeout=self.timeout)

    async def check_connection(self) -> tuple[bool, str]:
        """Vérifie la joignabilité et la validité de la clé API."""
        return await arr_common.check_connection(
            self.url, self.api_key, product=self.product, timeout=self.timeout
        )

    async def get_quality_profiles(self) -> list[dict]:
        """Récupère les profils de qualité configurés."""
        return await arr_common.get_quality_profiles(
            self.url, self.api_key, timeout=self.timeout
        )

    async def get_root_folders(self) -> list[dict]:
        """Récupère les dossiers racine disponibles."""
        return await arr_common.get_root_folders(
            self.url, self.api_key, timeout=self.timeout
        )

    async def get_tags(self) -> list[dict]:
        """Récupère les tags déclarés."""
        return await arr_common.get_tags(
            self.url, self.api_key, timeout=self.timeout
        )

    async def get_disk_space(self) -> list[dict]:
        """Récupère l'état de l'espace disque."""
        return await arr_common.get_disk_space(
            self.url, self.api_key, timeout=self.timeout
        )

    async def get_calendar(
        self,
        start: str | None = None,
        end: str | None = None,
        unmonitored: bool = False,
    ) -> list[dict]:
        """Récupère les sorties du calendrier."""
        return await arr_common.get_calendar(
            self.url,
            self.api_key,
            start=start,
            end=end,
            unmonitored=unmonitored,
            product=self.product,
            timeout=self.timeout,
        )

    async def get_notifications(self) -> list[dict]:
        """Récupère les connecteurs de notification configurés."""
        return await arr_common.get_notifications(
            self.url, self.api_key, timeout=self.timeout
        )

    async def delete_queue_item(
        self,
        queue_id: int,
        remove_from_client: bool = True,
        blocklist: bool = False,
    ) -> bool:
        """Supprime un élément de la file de téléchargement."""
        return await arr_common.delete_queue_item(
            self.url,
            self.api_key,
            queue_id=queue_id,
            remove_from_client=remove_from_client,
            blocklist=blocklist,
            product=self.product,
            timeout=self.timeout,
        )
