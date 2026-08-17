"""Diagnostic non identifiant des capacités d'affichage du navigateur."""

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db_async
from ..dependencies import require_auth
from ..services.diagnostics import record_event

router = APIRouter(prefix="/api", tags=["client-capabilities"], dependencies=[Depends(require_auth)])


class Viewport(BaseModel):
    width: int = Field(ge=1, le=20000)
    height: int = Field(ge=1, le=20000)
    visualWidth: int = Field(ge=1, le=20000)
    visualHeight: int = Field(ge=1, le=20000)
    dpr: float = Field(ge=0.5, le=10)


class SafeArea(BaseModel):
    top: int = Field(ge=0, le=1000)
    right: int = Field(ge=0, le=1000)
    bottom: int = Field(ge=0, le=1000)
    left: int = Field(ge=0, le=1000)


class ClientCapabilities(BaseModel):
    viewport: Viewport
    safeArea: SafeArea
    orientation: str = Field(max_length=40)
    pointer: Literal["coarse", "fine", "none"]
    hover: bool
    standalone: bool
    reducedMotion: bool
    horizontalSegments: Literal[1, 2]
    safeAreaSupported: bool


def classify_layout(data: ClientCapabilities) -> str:
    width = data.viewport.visualWidth
    if data.horizontalSegments == 2:
        return "foldable-dual"
    if width < 768:
        return "mobile-touch" if data.pointer == "coarse" else "mobile"
    if width < 1025:
        return "tablet-touch" if data.pointer == "coarse" else "tablet"
    return "desktop-touch" if data.pointer == "coarse" else "desktop"


@router.post("/client-capabilities")
async def save_client_capabilities(
    data: ClientCapabilities,
    request: Request,
    db: AsyncSession = Depends(get_db_async),
):
    profile = classify_layout(data)
    await record_event(
        db,
        category="client_layout",
        action="capabilities_reported",
        message=profile,
        details=data.model_dump(),
        correlation_id=f"client-layout:user:{request.session.get('user_id') or 'session'}",
    )
    await db.commit()
    return {"layout_profile": profile, "safe_area_applied": any(data.safeArea.model_dump().values())}
