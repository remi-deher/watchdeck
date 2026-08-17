import pytest
from pydantic import ValidationError

from app.routers.client_capabilities_api import ClientCapabilities, classify_layout


def payload(width=390, pointer="coarse", segments=1):
    return {
        "viewport": {"width": width, "height": 844, "visualWidth": width, "visualHeight": 760, "dpr": 3},
        "safeArea": {"top": 47, "right": 0, "bottom": 34, "left": 0},
        "orientation": "portrait-primary",
        "pointer": pointer,
        "hover": False,
        "standalone": True,
        "reducedMotion": False,
        "horizontalSegments": segments,
        "safeAreaSupported": True,
    }


def test_classifies_by_capabilities_instead_of_device_model():
    assert classify_layout(ClientCapabilities(**payload())) == "mobile-touch"
    assert classify_layout(ClientCapabilities(**payload(width=900))) == "tablet-touch"
    assert classify_layout(ClientCapabilities(**payload(width=1440, pointer="fine"))) == "desktop"
    assert classify_layout(ClientCapabilities(**payload(width=1400, segments=2))) == "foldable-dual"


def test_rejects_implausible_dead_zones():
    data = payload()
    data["safeArea"]["top"] = 5000
    with pytest.raises(ValidationError):
        ClientCapabilities(**data)
