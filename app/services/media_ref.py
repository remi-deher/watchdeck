"""Description commune d'un média de la bibliothèque, pour tout ce qui en renvoie un.

Chaque endpoint choisissait jusqu'ici ses champs, et un oubli passait inaperçu (le fond
manquait aux cartes « En cours » de l'encodage). Ici, une seule forme : si une image
existe en base, elle part. Les composants communs de l'interface reçoivent ce média
tel quel (type `MediaRef`) et affichent toute image disponible.
"""

from typing import Any, Optional


def media_ref(item: Any) -> Optional[dict[str, Any]]:
    """Le média (ligne `LibraryItem` ou ligne de requête aux mêmes colonnes), ou None."""
    if item is None:
        return None
    return {
        "id": item.id,
        "title": item.title,
        "year": item.year,
        "media_type": item.media_type,
        "poster_url": item.poster_url,
        "backdrop_url": getattr(item, "art_url", None),
    }
