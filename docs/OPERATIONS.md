# Exploitation Watchdeck

## Configuration

1. Copier `.env.example` vers `.env`.
2. Generer un mot de passe PostgreSQL long et unique.
3. Generer `WATCHDECK_ENCRYPTION_KEY` avec `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
4. Demarrer avec `docker compose up -d --build`.

L'API et le worker ARQ sont deux services independants. APScheduler est desactive par defaut.
`ENABLE_LEGACY_SCHEDULER=1` ne doit servir qu'au retour arriere temporaire, sans worker ARQ actif.

## Verification

```bash
docker compose ps
docker compose exec worker arq --check app.jobs.WorkerSettings
docker compose exec redis redis-cli ping
docker compose exec db pg_isready -U plexrss -d plexrss
```

Les metriques Prometheus sont exposees sur `/api/metrics/prometheus` et comprennent Redis,
le heartbeat ARQ, la profondeur de file et la derniere duree connue de chaque job.

## Sauvegarde complete (PostgreSQL + fichiers hors base)

```bash
docker compose --profile operations run --rm backup
```

Produit deux fichiers dans `./backups`, avec le meme horodatage :

- `plexarr-YYYYMMDDTHHMMSSZ.dump` — dump PostgreSQL custom, verifie avec `pg_restore --list`.
- `app-data-YYYYMMDDTHHMMSSZ.tar.gz` — cle de chiffrement au repos (`data/.encryption_key`,
  protege les tokens Plex/*arr et mots de passe SMTP stockes en base), cle de signature de
  session (`data/.secret_key`) et l'etat des conflits ignores (`data/ignored_conflicts.json`).
  **Sans ce fichier, un dump PostgreSQL seul ne permet pas de reconstituer une instance
  utilisable a l'identique** (les champs chiffres redeviennent illisibles sans la cle).

Les fichiers plus anciens que `BACKUP_RETENTION_DAYS` sont supprimes (les deux prefixes).

## Restauration

Arreter l'API et le worker pour garantir une restauration sans ecriture concurrente :

```bash
docker compose stop plex-rss worker
RESTORE_FILE=plexarr-YYYYMMDDTHHMMSSZ.dump CONFIRM_RESTORE=YES docker compose --profile operations run --rm restore
docker compose up -d plex-rss worker
```

Le fichier `app-data-YYYYMMDDTHHMMSSZ.tar.gz` correspondant (meme horodatage) est restaure
automatiquement si present dans `./backups` ; sinon `RESTORE_DATA_FILE=app-data-...tar.gz` le
force explicitement.

Verifier ensuite les migrations, l'API, le worker et un echantillon de demandes. Une restauration
doit etre repetee regulierement sur une base temporaire : un dump non restaure n'est pas un test.

## Reprise apres sinistre depuis l'interface

Alternative a la procedure CLI ci-dessus, accessible sans acces shell/`docker compose` :

- **Reglages -> Donnees -> "Reprise apres sinistre"** (`GET /api/backup/full`, admin) : telecharge
  une archive unique (dump PostgreSQL + fichiers hors base + export JSON de repli). C'est la seule
  methode qui restaure absolument tout a l'identique, y compris le compte admin et les historiques
  — contrairement a l'export JSON classique, volontairement partiel (voir plus haut).
- **Restauration depuis Reglages** (`POST /api/backup/full/restore`, admin, confirmation "REMPLACER"
  requise) : remplace ENTIEREMENT la base et la configuration actuelles par celles de l'archive.
  Une sauvegarde de securite de l'etat courant est prise automatiquement juste avant (dans
  `data/backups/`), mais rien de l'etat actuel n'est fusionne ou conserve au-dela. Le conteneur
  redemarre ensuite (`restart: unless-stopped`) pour repartir sur des connexions fraiches.
- **Restauration depuis `/setup`** (`POST /setup/restore`) : meme mecanisme, utilisable a la place
  de la creation manuelle d'un compte sur une instance fraiche pas encore configuree — bloque des
  qu'un compte existe deja.

Verrouillage partage (Redis) avec la migration SQLite legacy : les deux operations remplacent
entierement la base et ne peuvent pas s'executer en parallele l'une de l'autre.

## Mise a jour

1. Executer une sauvegarde.
2. Recuperer la nouvelle version et lire les migrations.
3. Executer `docker compose build`.
4. Executer `docker compose up -d`.
5. Controler `docker compose ps`, les logs API/worker et les metriques.
6. En cas d'echec, revenir a l'image precedente puis restaurer uniquement si une migration a modifie les donnees.

## Temps reel

`/api/events` est un flux SSE authentifie par cookie de session. Redis Streams conserve les 1 000
derniers signaux et permet la reprise via `Last-Event-ID`. Les evenements ne contiennent pas de liste
metier : le navigateur recharge l'endpoint REST soumis aux permissions de l'utilisateur.

## Reverse-proxy : HTTP/2 et cache des assets

Watchdeck sert une SPA : une navigation demande l'entree, les chunks de route et les feuilles
de style, soit plusieurs dizaines de fichiers. En HTTP/1.1 le navigateur plafonne a six
connexions par origine et la cascade s'allonge d'autant. Verifier le protocole reellement
negocie :

```bash
curl -s -o /dev/null -w '%{http_version}\n' https://<domaine>/dashboard
```

La reponse doit etre `2`. Si elle vaut `1.1`, activer HTTP/2 sur le proxy.

- **Nginx Proxy Manager** (`Server: openresty` et en-tete `X-Served-By` dans la reponse) :
  *Hosts > Proxy Hosts > editer l'hote > onglet SSL > cocher `HTTP/2 Support` > Save*.
  L'option n'apparait qu'une fois un certificat SSL attache.
- **Nginx nu** : `listen 443 ssl; http2 on;` dans le `server` block.
- **Caddy / Traefik** : actif par defaut, rien a faire.

Les assets sous `/vue/assets/` portent un hash de contenu dans leur nom et ne changent jamais
a URL constante : ils supportent `Cache-Control: public, max-age=31536000, immutable`. Un
`max-age` court y fait revalider tout le bundle a chaque expiration sans aucun benefice.
