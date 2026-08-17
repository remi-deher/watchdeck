from unittest.mock import AsyncMock, patch

import pytest

from app.models import PlaybackIpLocation
from app.services.ip_geolocation import (
    _address_hash,
    _needs_network_enrichment,
    _parse_network_info,
    _parse_plex_geoip,
    _resolve_network_info,
    lookup_ip_location,
    lookup_ip_locations,
)


def test_parse_network_info_extracts_operator_and_asn():
    result = _parse_network_info(
        {
            "connection": {"asn": 12322, "org": "Free SAS", "isp": "Free"},
        }
    )

    assert result == {
        "geo_isp": "Free",
        "geo_organization": "Free SAS",
        "geo_asn": "AS12322",
    }


def test_parse_plex_geoip_extracts_location_and_coordinates():
    result = _parse_plex_geoip(
        '<location code="FR" country="France" city="Lyon" subdivisions="Auvergne-Rhone-Alpes" '
        'coordinates="45.75, 4.85" />'
    )

    assert result == {
        "geo_status": "resolved",
        "geo_city": "Lyon",
        "geo_region": "Auvergne-Rhone-Alpes",
        "geo_country": "France",
        "geo_country_code": "FR",
        "geo_lat": 45.75,
        "geo_lon": 4.85,
    }


def test_needs_network_enrichment_only_for_resolved_status_without_network():
    assert _needs_network_enrichment(
        {"geo_status": "resolved", "geo_isp": None, "geo_organization": None, "geo_asn": None}
    )
    assert not _needs_network_enrichment(
        {"geo_status": "resolved", "geo_isp": "Orange S.A.", "geo_organization": None, "geo_asn": None}
    )
    assert not _needs_network_enrichment(
        {"geo_status": "local", "geo_isp": None, "geo_organization": None, "geo_asn": None}
    )
    assert not _needs_network_enrichment(
        {"geo_status": "anonymized", "geo_isp": None, "geo_organization": None, "geo_asn": None}
    )


@pytest.mark.asyncio
async def test_private_ip_is_not_sent_to_external_lookup():
    with patch("app.services.ip_geolocation.httpx.AsyncClient") as client:
        result = await lookup_ip_location("192.168.1.25")

    assert result["geo_status"] == "local"
    assert result["geo_country"] == "local"
    client.assert_not_called()


@pytest.mark.asyncio
async def test_anonymized_ip_is_not_sent_to_external_lookup():
    with patch("app.services.ip_geolocation.httpx.AsyncClient", new=AsyncMock()) as client:
        result = await lookup_ip_location("8.8.8.0", anonymized=True)

    assert result["geo_status"] == "anonymized"
    client.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_network_info_never_calls_provider_for_private_address():
    with patch("app.services.ip_geolocation.httpx.AsyncClient") as client:
        result = await _resolve_network_info("192.168.1.25")

    assert result == {"geo_isp": None, "geo_organization": None, "geo_asn": None}
    client.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_network_info_degrades_gracefully_when_provider_is_down():
    with patch("app.services.ip_geolocation.httpx.AsyncClient", side_effect=RuntimeError("boom")):
        result = await _resolve_network_info("82.64.10.20")

    assert result == {"geo_isp": None, "geo_organization": None, "geo_asn": None}


@pytest.mark.asyncio
async def test_persistent_location_is_reused_without_storing_raw_ip(async_db):
    resolved = {
        "geo_status": "resolved",
        "geo_city": "Paris",
        "geo_region": "Île-de-France",
        "geo_country": "France",
        "geo_country_code": "FR",
        "geo_lat": 48.8566,
        "geo_lon": 2.3522,
        "geo_isp": "Orange S.A.",
        "geo_organization": "POP DIJ",
        "geo_asn": "AS3215",
    }
    with patch(
        "app.services.ip_geolocation.lookup_ip_location",
        new=AsyncMock(return_value=resolved),
    ) as lookup:
        first = await lookup_ip_locations({"82.64.10.20"}, db=async_db)
        await async_db.commit()
        second = await lookup_ip_locations({"82.64.10.20"}, db=async_db)

    assert first["82.64.10.20"] == resolved
    assert second["82.64.10.20"] == resolved
    lookup.assert_awaited_once_with("82.64.10.20")
    stored = async_db.query(PlaybackIpLocation).one()
    assert stored.geo_city == "Paris"
    assert "82.64.10.20" not in stored.address_hash


@pytest.mark.asyncio
async def test_old_resolved_entry_without_network_info_gets_enriched(async_db):
    """Reproduit 'Hyper tension 2' : une entrée persistante déjà géolocalisée
    (ville/pays connus) mais sans FAI/organisation/ASN doit être complétée par
    ipwho.is au prochain lookup, sans dupliquer l'entrée ni perdre la ville."""
    async_db.add(
        PlaybackIpLocation(
            address_hash=_address_hash("82.64.10.20"),
            geo_status="resolved",
            geo_city="Yutz",
            geo_country="France",
            geo_lat=49.35,
            geo_lon=6.17,
        )
    )
    async_db.commit()

    network = {"geo_isp": "Orange S.A.", "geo_organization": "POP DIJ", "geo_asn": "AS3215"}
    with patch(
        "app.services.ip_geolocation._resolve_network_info",
        new=AsyncMock(return_value=network),
    ) as resolve_network:
        result = await lookup_ip_locations({"82.64.10.20"}, db=async_db)
        await async_db.commit()

    resolve_network.assert_awaited_once_with("82.64.10.20")
    assert result["82.64.10.20"]["geo_city"] == "Yutz"
    assert result["82.64.10.20"]["geo_country"] == "France"
    assert result["82.64.10.20"]["geo_isp"] == "Orange S.A."
    assert result["82.64.10.20"]["geo_organization"] == "POP DIJ"
    assert result["82.64.10.20"]["geo_asn"] == "AS3215"
    assert async_db.query(PlaybackIpLocation).count() == 1
    stored = async_db.query(PlaybackIpLocation).one()
    assert stored.geo_city == "Yutz"
    assert stored.geo_isp == "Orange S.A."


@pytest.mark.asyncio
async def test_enrichment_failure_never_erases_existing_location(async_db):
    async_db.add(
        PlaybackIpLocation(
            address_hash=_address_hash("82.64.10.20"),
            geo_status="resolved",
            geo_city="Yutz",
            geo_country="France",
        )
    )
    async_db.commit()

    with patch(
        "app.services.ip_geolocation._resolve_network_info",
        new=AsyncMock(return_value={"geo_isp": None, "geo_organization": None, "geo_asn": None}),
    ):
        result = await lookup_ip_locations({"82.64.10.20"}, db=async_db)

    assert result["82.64.10.20"]["geo_city"] == "Yutz"
    assert result["82.64.10.20"]["geo_isp"] is None
    stored = async_db.query(PlaybackIpLocation).one()
    assert stored.geo_city == "Yutz"


@pytest.mark.asyncio
async def test_anonymized_lookup_never_calls_network_resolver(async_db):
    with patch(
        "app.services.ip_geolocation._resolve_network_info",
        new=AsyncMock(),
    ) as resolve_network:
        result = await lookup_ip_locations({"82.64.10.20"}, db=async_db, anonymized=True)

    assert result["82.64.10.20"]["geo_status"] == "anonymized"
    resolve_network.assert_not_awaited()
