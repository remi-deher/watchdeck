#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "Restore refused: set CONFIRM_RESTORE=YES"
  exit 2
fi
if [ -z "${RESTORE_FILE:-}" ] || [ ! -f "/backups/$RESTORE_FILE" ]; then
  echo "Restore refused: RESTORE_FILE must name a file in ./backups"
  exit 2
fi
pg_restore --list "/backups/$RESTORE_FILE" >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$PGDATABASE" "/backups/$RESTORE_FILE"
echo "Restore completed: $RESTORE_FILE"

# Restauration optionnelle des fichiers hors base (cle de chiffrement, cle de
# session, conflits ignores) produits par le meme run de sauvegarde. Deduite
# du nom du dump (meme horodatage) si RESTORE_DATA_FILE n'est pas fourni.
data_file="${RESTORE_DATA_FILE:-}"
if [ -z "$data_file" ]; then
  guessed="$(printf '%s' "$RESTORE_FILE" | sed -n 's/^watchdeck-\(.*\)\.dump$/app-data-\1.tar.gz/p')"
  [ -n "$guessed" ] && [ -f "/backups/$guessed" ] && data_file="$guessed"
fi
if [ -n "$data_file" ]; then
  if [ ! -f "/backups/$data_file" ]; then
    echo "Restore refused: RESTORE_DATA_FILE must name a file in ./backups"
    exit 2
  fi
  tar -xzf "/backups/$data_file" -C /app/data
  echo "Data files restored: $data_file"
else
  echo "No matching app-data-*.tar.gz found: encryption/session keys and ignored conflicts left untouched."
fi
