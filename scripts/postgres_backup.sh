#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="/backups/watchdeck-${timestamp}.dump"
data_target="/backups/app-data-${timestamp}.tar.gz"
mkdir -p /backups
pg_dump --format=custom --compress=9 --file="$target"
pg_restore --list "$target" >/dev/null
find /backups -type f -name 'watchdeck-*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete

# Fichiers hors base essentiels a une restauration complete : cle de chiffrement
# au repos (tokens Plex/*arr, mots de passe SMTP...), cle de signature de session,
# et l'etat des conflits ignores par l'utilisateur. Sans eux, un pg_dump seul ne
# suffit pas a reconstituer une instance utilisable a l'identique.
data_files=""
for f in .encryption_key .secret_key ignored_conflicts.json; do
  [ -f "/app/data/$f" ] && data_files="$data_files $f"
done
if [ -n "$data_files" ]; then
  tar -czf "$data_target" -C /app/data $data_files
  find /backups -type f -name 'app-data-*.tar.gz' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  printf 'Backup verified: %s\nData files backed up: %s (%s)\n' "$target" "$data_target" "$data_files"
else
  printf 'Backup verified: %s\nNo data files found to back up (.encryption_key/.secret_key/ignored_conflicts.json absent).\n' "$target"
fi
