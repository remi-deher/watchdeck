#!/bin/sh
# Load the shared key while privileged, then run transfers as the media owner.
# The data volume stays read-only; no widening of the key file permissions.
set -eu
if [ -z "${WATCHDECK_ENCRYPTION_KEY:-}" ] && [ -z "${WATCHDECK_SECRET_KEY:-}" ]; then
    if [ ! -s /app/data/.encryption_key ]; then
        echo "Shared encryption key unavailable; start the API first or configure WATCHDECK_ENCRYPTION_KEY." >&2
        exit 1
    fi
    WATCHDECK_ENCRYPTION_KEY=$(cat /app/data/.encryption_key)
    export WATCHDECK_ENCRYPTION_KEY
fi
exec su-exec "${TRANSFER_UID:-568}:${TRANSFER_GID:-568}" "$@"
