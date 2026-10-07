# Chargement et fluidité

Le worker prépare les sections du dashboard toutes les 30 secondes dans Redis.
Chaque section possède sa propre entrée : fraîcheur de 15 secondes, conservation
de la dernière réponse réussie pendant 15 minutes. Le flux sert ces valeurs dès
qu'elles sont disponibles, puis remplace les sections périmées au fil de leur
recalcul. Les deux endpoints du dashboard partagent les mêmes entrées.

Les événements et les actions explicites utilisent `refresh=true` pour obtenir
les données à jour même quand une entrée est encore fraîche. Les calculs sont
dédupliqués par section dans chaque processus. Une section en erreur ne remplace
pas sa dernière valeur réussie et n'empêche pas les autres de s'afficher. Le
compte à rebours est indépendant et les calculs sont bornés dans le temps.

Les compteurs Sonarr/Radarr sont préparés toutes les deux minutes, avec des
sessions séparées. Le chemin de rendu du dashboard consulte leurs dernières
valeurs ; il ne contacte pas ces services. En cas de panne, les valeurs réussies
restent disponibles jusqu'à expiration de leur conservation de 15 minutes.

Après une collecte avec des lectures actives, une tâche indépendante prépare les
affiches, fonds et logos Plex. Elle traite au plus 12 sessions, les plus récentes
d'abord, avec trois préparations simultanées et un budget global de 45 secondes.
Les variantes correspondent aux tailles utilisées par les composants. API et
worker partagent `data/image_cache` dans Docker Compose. La préparation peut
être relancée après un échec, sans retarder la publication des lectures.

Le proxy déduplique les téléchargements d'une même source dans chaque processus,
même pour des tailles différentes. Les fichiers sont publiés par remplacement
atomique. Une variante périmée est servie immédiatement pendant son actualisation
en arrière-plan. La priorité de chargement est donnée aux visuels de la première
lecture ; les autres conservent le chargement différé. Le service worker couvre
également les images de `/api/playback/thumb` et son cache est purgé à la déconnexion.

Le démarrage ne charge plus les graphiques ni la fiche média. Les composants des
routes restent dans leur graphe d'import différé. Les délais d'apparition des
panneaux et des cartes sont supprimés ; le fondu court de navigation est conservé.
Les rafraîchissements des queries au retour sur l'onglet sont confiés à TanStack
Query. Le flux du dashboard est annulé à la sortie de page et limité à 30 secondes.

## Vérification

- `npm run typecheck`, `npm run test:unit`, `npm run build`.
- Tests déterministes des amonts lents et du préchargement :
  `python -m pytest tests/test_loading_performance.py`.
- Avec une base PostgreSQL de test configurée par `TEST_DATABASE_URL` :
  `python -m pytest tests/test_dashboard_stream.py tests/test_dashboard_snapshot.py tests/test_image_proxy.py`.
- Comparer l'ouverture à froid, le retour après navigation, la reprise après veille
  et l'arrivée d'une nouvelle lecture. Mesurer séparément l'arrivée des sections,
  l'affichage des images et les déplacements de mise en page.

Les tailles du build ne représentent pas une mesure de latence en production.
Les workers et l'API doivent être mis à jour ensemble pour bénéficier de la
préparation des caches et des images.
