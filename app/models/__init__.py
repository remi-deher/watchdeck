"""Modeles SQLAlchemy et enumerations metier.

Ce package remplace l'ancien module `app/models.py` de 1177 lignes. Il reexporte
tous les noms, pour que les ~164 sites qui font `from .models import X` restent
inchanges -- et pour que `Base.metadata` connaisse bien toutes les tables (Alembic
s'appuie dessus pour l'autogeneration).
"""

from .base import (
    Base,
    FulfillmentStatus,
    RequestStatus,
    VfCategory,
    WatchlistSource,
)
from .cache import (
    SearchCache,
    TrackerFavicon,
)
from .connections import (
    ArrInstance,
    DownloadClient,
    EmailProvider,
)
from .downloads import (
    DownloadHistory,
    RadarrQueueObservation,
    SeriesAcquisitionBatch,
    SonarrQueueObservation,
)
from .email_config import EmailBranding, EmailTemplate
from .logs import (
    AdminActionLog,
    DeletedMediaLog,
    DiagnosticEvent,
    JobRunLog,
    PollHistory,
)
from .media import (
    EpisodeAvailability,
    EpisodeMetadata,
    LibraryItem,
    MediaIssue,
    MediaRequest,
    RequestSeasonStatus,
    VfEpisodeStatus,
    VfUpgradeScanRun,
    VfUpgradeScanRunItem,
    VfUpgradeSuggestion,
)
from .notifications import (
    NotificationLog,
    NotificationMilestone,
    PendingNotification,
)
from .playback import (
    LibraryAnalyticsSnapshot,
    PlaybackDailyAggregate,
    PlaybackIpLocation,
    PlaybackSession,
    PlaybackSessionSegment,
)
from .settings import (
    Settings,
)
from .users import (
    LoginAttempt,
    PasskeyCredential,
    PlexUser,
)

__all__ = [
    "AdminActionLog",
    "ArrInstance",
    "Base",
    "DeletedMediaLog",
    "DiagnosticEvent",
    "DownloadClient",
    "DownloadHistory",
    "EmailBranding",
    "EmailTemplate",
    "EmailProvider",
    "EpisodeAvailability",
    "EpisodeMetadata",
    "FulfillmentStatus",
    "JobRunLog",
    "LibraryAnalyticsSnapshot",
    "LibraryItem",
    "LoginAttempt",
    "MediaIssue",
    "MediaRequest",
    "NotificationLog",
    "NotificationMilestone",
    "PasskeyCredential",
    "PendingNotification",
    "PlaybackDailyAggregate",
    "PlaybackIpLocation",
    "PlaybackSession",
    "PlaybackSessionSegment",
    "PlexUser",
    "PollHistory",
    "RadarrQueueObservation",
    "RequestSeasonStatus",
    "RequestStatus",
    "SearchCache",
    "TrackerFavicon",
    "SeriesAcquisitionBatch",
    "Settings",
    "SonarrQueueObservation",
    "VfCategory",
    "VfEpisodeStatus",
    "VfUpgradeScanRun",
    "VfUpgradeScanRunItem",
    "VfUpgradeSuggestion",
    "WatchlistSource",
]
