# Migration squashée pour le futur dépôt `watchdeck`

Ce dossier contient un artefact préparé pour la bascule vers le nouveau dépôt
GitHub `remi-deher/watchdeck` (lots 7-9 du plan de rebranding) — **il n'est
pas branché sur l'application actuelle**. L'historique Alembic en place dans
`alembic/versions/` (133 fichiers, `0001_initial_schema` → `f364147d0334`)
continue de servir cette instance plex-rss/Watchdeck jusqu'à la bascule.

## Contenu

`0001_initial_schema.py` — une unique migration Alembic qui recrée, sur une
base Postgres vide, un schéma **rigoureusement identique** à celui produit
aujourd'hui par les 133 migrations existantes. Elle sera la seule migration
du nouveau dépôt.

## Pourquoi pas `alembic revision --autogenerate` contre `Base.metadata` ?

Testé et rejeté : `alembic check` contre une base migrée avec l'historique
complet a détecté des écarts réels entre `app/models/*.py` et le schéma vivant
(index manquants dans les modèles, nullable différents, un type
`EncryptedText` vs `VARCHAR`, etc.). Générer la migration depuis les modèles
aurait donc silencieusement perdu des index/contraintes présents en
production.

À la place, la migration embarque le SQL exact issu d'un `pg_dump
--schema-only` de la base réellement migrée (voir procédure ci-dessous),
garantissant une fidélité totale.

## Comment ça a été généré et vérifié (2026-08-16)

```bash
# 1. Postgres jetable, on rejoue l'historique complet actuel
docker run -d --name squash-pg -e POSTGRES_USER=plexrss -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=plexrss -p 15432:5432 postgres:15-alpine
DATABASE_URL="postgresql://plexrss:test@127.0.0.1:15432/plexrss" python -m alembic upgrade head

# 2. Dump du schéma réel (table alembic_version exclue, gérée à part par Alembic)
docker exec squash-pg pg_dump -U plexrss -d plexrss --schema-only --no-owner \
  --no-privileges --exclude-table=alembic_version > schema_full_chain.sql

# 3. Nettoyage des commandes psql non-SQL (\restrict / \unrestrict, ajoutées par
#    les pg_dump récents, invalides via SQLAlchemy/psycopg2)
grep -v "restrict" schema_full_chain.sql > schema_clean.sql

# 4. schema_clean.sql est embarqué tel quel dans SCHEMA_SQL de 0001_initial_schema.py,
#    exécuté via op.execute(). Un SET search_path TO public est rajouté après :
#    pg_dump vide le search_path (il qualifie tout en public.xxx dans son dump),
#    ce qui casse sinon l'INSERT INTO alembic_version qu'Alembic fait ensuite.

# 5. Vérification : appliquer SEULEMENT cette migration sur une base neuve,
#    puis re-dumper et diff contre schema_clean.sql -> diff vide confirmé.
#    Testé à la fois en SQL brut (psql) et via une vraie commande
#    `alembic upgrade head` (alembic_version correctement stampé à
#    "0001_initial_schema").
```

Résultat : `diff` vide dans les deux cas (schéma brut et schéma post-Alembic).
Le squash est fonctionnellement identique à l'historique actuel.

## Utilisation lors de la bascule (lots 7-9)

1. Dans le nouveau dépôt `watchdeck`, remplacer le contenu de
   `alembic/versions/` par ce seul fichier (renommer la révision si besoin
   pour coller aux conventions du nouveau dépôt).
2. Toute nouvelle installation Watchdeck part directement de ce schéma via
   `alembic upgrade head` — pas de replay des 133 anciennes migrations.
3. Pour la migration de la production existante : **ne pas** faire un
   `alembic upgrade` en place depuis l'ancien historique. Suivre plutôt la
   procédure de sauvegarde/restauration (voir `docs/OPERATIONS.md` et le
   script `scripts/postgres_backup.sh` / `scripts/postgres_restore.sh`) :
   dump complet (schéma + données) de l'ancienne base, restauration dans la
   base neuve du nouveau déploiement, puis `alembic stamp head` (le schéma
   restauré étant strictement identique à celui que produit cette migration).
4. Ne pas oublier la clé de chiffrement (`WATCHDECK_ENCRYPTION_KEY` /
   `data/.encryption_key`) et le reste du volume `data/` (cache image, etc.)
   — un dump Postgres seul ne suffit pas à restaurer une instance complète.
