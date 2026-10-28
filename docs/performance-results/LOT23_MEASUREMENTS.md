# Lots 2 et 3 — Corrections et mesures

Date : 28 octobre 2026. Les deux lots sont implémentés. Les mesures ci-dessous
portent sur le laboratoire local, pas sur la production.

## Résultats comparés

Même machine, même PostgreSQL et même profil : **50 000 médias, 200 000 lectures,
10 000 demandes et 501 comptes**. La référence « avant » est le commit
`8e1dac914eaca5fa300f90753129056fe82444ea` (lots 0 et 1). Elle a été relancée
séparément des tests ; les mesures après correction utilisent le code des lots 2
et 3. Chaque route reçoit 20 requêtes HTTP successives, authentifiées. Les
résultats du lot 0 restent intacts.

| Mesure | Avant | Après | Lecture |
|---|---:|---:|---|
| Page analytique de 100 médias, tri par titre, p95 HTTP | 502,7 ms | 30,2 ms | −94 % |
| Résumé analytique sans filtre, p95 HTTP | 471,4 ms | 7,8 ms | −98 % |
| Mémoire résidente du serveur après les pages analytiques | 522 MiB | 126 MiB | −76 % sur ce parcours |
| Rafraîchissement sans changement, catalogue connu | non isolé dans cette campagne avant | 158 à 161 ms | 200 000 lectures vérifiées en SQL |
| Correction historique d'une lecture | non isolée avant | 6 461 ms | Catalogue réutilisé ; seuls les médias concernés sont réagrégés |
| Reconstruction complète forcée, médiane sur 3 passages | 6 304 ms | 9 762 ms | Coût supplémentaire de publication persistée |
| Pic mémoire du processus de reconstruction forcée | 1 420 MiB | 1 073 MiB | −24 % |
| Retard maximal de sa boucle asynchrone | 4 669 ms | 1 425 ms | Réduit, mais encore présent pendant une reconstruction |

La reconstruction complète est **plus lente** : elle écrit maintenant les lignes
indexées et conserve aussi le JSON de retour arrière. Ce compromis permet aux
lectures courantes d'éviter le traitement du catalogue complet. Une modification
d'historique entraîne encore la publication d'une génération complète, même si
les agrégats sont recalculés uniquement pour les médias concernés. Le diff SQL
parcourt l'historique pour détecter aussi les corrections anciennes et suppressions.

Le banc du worker remplace l'acquisition Plex par une fixture de 100 ms et force
une empreinte indisponible : ses trois passages reconstruisent tout, avec
initialisation des contributions au premier passage. Il ne mesure pas les crons
ni les latences d'un vrai serveur Plex. Le scénario incrémental utilise ensuite
une empreinte stable : **une seule acquisition de catalogue** sur quatre passages,
y compris une correction historique sans modification de `last_seen_at`.
Cette correction ajoute une milliseconde au temps regardé dans la base jetable ;
les volumes restent identiques pour les mesures HTTP après correction.

Le plan SQL de la page par titre utilise `ix_analytics_title` et lit 100 lignes
en environ 0,1 ms dans le relevé isolé. Ce temps SQL ne représente pas la latence
HTTP complète. Les tris textuels utilisent la collation `C` pour conserver l'ordre
Unicode normalisé par Python.

## Lot 2 : appels externes, stockage et images

- Pools HTTP réutilisés pour TMDB, Plex et les images, séparés selon leur
  configuration TLS, délai et redirection. HTTPX sépare les connexions par origine.
  Les jetons restent attachés aux requêtes et les cookies sont refusés.
- Pool Redis de publication réutilisé ; chaque lecteur SSE conserve sa connexion
  bloquante distincte. Fermeture des pools à l'arrêt de l'API et du worker, après
  annulation des tâches qui les utilisent.
- Découverte des racines sur trois instances au maximum en parallèle, avec une
  session SQL par tâche, un délai de 15 s par découverte et un budget global de
  20 s. Une instance lente est annulée ; les résultats terminés sont conservés.
- Téléchargements d'images limités à **6**, encodages à **2**, par processus.
  Réglages : `IMAGE_MAX_DOWNLOADS` et `IMAGE_MAX_ENCODERS`, minimum 1.
  Les verrous par source et variante, le cache disque et le service des images
  périmées pendant leur actualisation sont conservés.
- Résolution Plex mise en cache avec la configuration des hôtes : aucune nouvelle
  session SQL de configuration sur les images chaudes après initialisation.
  Invalidation après commit local des réglages, serveurs et URL Arr, y compris les
  écritures ORM en masse ; relecture au plus tard après 60 s dans les autres
  processus. Les contrôles de destination et de redirection restent appliqués.

### Attente d'une grille d'images

Fixture : 60 JPEG synthétiques de 1280 × 1920, source simulée de 20 ms,
**vrais encodages Pillow** en WebP de 300 pixels. Ce scénario mesure les files
locales ; il ne mesure pas un CDN réel.

| Mesure | p50 | p95 |
|---|---:|---:|
| Réponse sur grille froide | 1 107 ms | 1 987 ms |
| Attente d'une place de téléchargement | 100 ms | 201 ms |
| Attente d'une place d'encodage | 906 ms | 1 690 ms |
| Réponse sur grille chaude | 8,6 ms | 9,6 ms |

Les pics observés sont exactement **6 téléchargements et 2 encodages** ; seules
60 acquisitions amont ont lieu pour les 120 requêtes froide puis chaude. La file
d'encodage domine sur cette fixture. Les limites retenues bornent le travail CPU
et les téléchargements d'une grille froide ; elles devront être ajustées selon
les ressources du déploiement et les images réelles. Chaque processus possède
ses propres limites : plusieurs workers multiplient la concurrence totale.

## Lot 3 : projection analytique persistée

La migration `0054_analytics_projection` ajoute trois tables : générations,
médias indexés et contributions des lectures. Le pointeur de génération rejoint
l'instantané existant, dont le JSON reste disponible pour un retour arrière.

La collecte Plex utilise des pages de 500 éléments et trois bibliothèques en
parallèle, avec un budget global de 120 s. Une page répétée ou une fin prématurée
par rapport à `totalSize` fait échouer la reconstruction. Un serveur qui réduit
la taille des pages est pris en charge. Les empreintes du catalogue et des
lectures sont distinctes ; changer de serveur, de jeton ou de configuration TLS
invalide également l'identité du catalogue.

Les nouvelles lectures, modifications anciennes et suppressions synchronisent
les contributions par lots de 1 000. Le calcul SQL conserve les comptes, durées,
spectateurs et les vingt dernières lectures, avec les mêmes règles de corrélation
que l'ancien calcul. Les pages, résumés et fiches lisent la projection SQL ;
l'export complet peut toujours charger tous les médias puisqu'il les restitue.

Une transaction unique publie les lignes, leur résumé, le pointeur et le JSON
compatible avec l'ancienne version. Un verrou PostgreSQL sérialise les producteurs.
Une reconstruction échouée n'écrase pas la génération réussie. Les lecteurs
protègent leur génération pendant leur transaction ; la collecte des anciennes
versions les ignore. Les trois générations les plus récentes sont conservées,
ainsi que toute ancienne génération encore utilisée. Les réponses de liste et
résumé exposent `projection_version` et `refreshed_at`.

### Stockage et limites restantes

À la fin de cette campagne comprenant plusieurs reconstructions, les relations
occupent environ **582 MiB** pour les médias et index, **41 MiB** pour les
contributions et **7,6 MiB** pour l'instantané compatible. Ces tailles PostgreSQL
allouées incluent les espaces réutilisables laissés par les anciennes générations ;
elles ne sont pas une estimation minimale du stockage vivant. Prévoir cette
capacité et suivre l'autovacuum lors du déploiement.

Les reconstructions complètes et exports restent proportionnels au catalogue.
Les filtres non couverts par les index peuvent encore parcourir la projection.
Les statistiques générales d'activité à froid restent un chantier du lot 4 :
le lot 3 traite l'analytique de bibliothèque. Aucun frontend n'a été modifié.

## Validation

- Suite complète : **2 602 réussites, 6 tests ignorés**, 24 avertissements ;
  aucun échec. Après les derniers ajustements : 31 tests analytiques réussis,
  puis 4 cas de pagination et 2 tests de pools réussis. Les avertissements de la
  suite comprennent notamment des annulations de connexions asynchrones dans
  les tests ; le contrôle ciblé des nouveaux pools passe sans avertissement.
- Comparaison PostgreSQL avec l'ancien calcul : tous les tris dans les deux sens,
  filtres, Unicode, recherche littérale `%`/`_`, distributions, totaux, fiches,
  insights et données d'export.
- Vérification SQL : page, résumé et fiche fonctionnent même lorsque le JSON
  global est volontairement corrompu et ne le sélectionnent pas.
- Correction historique, suppression, absence de nouvelle collecte Plex, agrégation
  limitée au média concerné, publication échouée et lecteur concurrent protégé.
- Connexion HTTP TCP réellement réutilisée entre deux identités, absence de cookie
  partagé, séparation TLS et fermeture ; réutilisation et fermeture du publisher
  Redis ; tests Redis de publication et abonnement sur conteneur local.
- Limites d'images, cache Plex et invalidation après commit ; découverte des
  racines avec session isolée et annulation d'une instance lente.
- Migration sur base vide, retour en `0053`, insertion d'un instantané historique,
  remontée en `0054`, puis retour en `0053` : JSON historique conservé.
- Ruff et `git diff --check` passent sur les modifications.

## Mise en place

1. Sauvegarder la base et prévoir la capacité supplémentaire mesurée.
2. Appliquer la migration `0054`, puis déployer ensemble l'API et le worker.
   Le démarrage applicatif habituel exécute les migrations.
3. Lancer un rafraîchissement analytique habituel. Jusqu'à sa réussite, l'ancien
   instantané reste lisible. Vérifier les volumes et les champs de fraîcheur.
4. Suivre les temps de page, la mémoire du worker, les durées de reconstruction,
   l'attente des images, le volume des tables et l'autovacuum. Ajuster les limites
   d'images selon le nombre de processus et les ressources disponibles.
5. En cas de retour arrière, arrêter les producteurs et remettre ensemble
   l'ancienne API et l'ancien worker. Le JSON compatible est conservé ; la
   migration peut rester en place. Son downgrade supprime les projections
   supplémentaires et préserve l'ancien instantané.

Cette campagne ne déploie pas l'application en production. Le protocole et les
commandes sont décrits dans [le guide](../../scripts/performance/README.md).
Les relevés sont conservés dans [lot23](lot23/), notamment les fichiers HTTP
avant/après, les mesures worker et incrémentales, la file d'images, le plan SQL
et les volumes de stockage.
