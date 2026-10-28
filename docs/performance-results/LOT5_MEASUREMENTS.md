# Lot 5 — Requêtes, temps réel et caches du navigateur

Date : 28 octobre 2026. Ce lot modifie le frontend et le service worker ; aucune
migration SQL n'est nécessaire. Il prolonge les lots 0 à 4.

## Corrections

| Périmètre | Comportement livré |
|---|---|
| Délais HTTP | `timeoutMs` est réellement appliqué, jusqu'à la fin de lecture du corps. Valeurs par défaut : 20 s pour les lectures ordinaires, 60 s pour fiches/enrichissements/calendrier/exports et mutations, 180 s pour l'analytique lourde et le flux de préparation du dashboard. Une surcharge reste possible par appel. |
| Annulation | Le délai et le signal de l'appelant sont composés. Une annulation reste `AbortError`, un dépassement devient `TimeoutError`, une panne réseau devient `NetworkError`. Les temporisations et écouteurs sont libérés après chaque appel. |
| Fiches | Le signal TanStack est transmis à la fiche média et à ses lectures auxiliaires. Les lectures manuelles de fiche utilisateur, saisons et inspection torrent sont annulées à la fermeture ou au changement de cible ; une réponse tardive ne repeint pas l'ancienne cible. Les mutations déjà envoyées continuent leur traitement. |
| Relances | Les erreurs permanentes, dont 401/403/404/409/422, et les annulations ne sont plus relancées. Les erreurs transitoires ont au maximum deux relances ; un dépassement de délai en a une. Attente exponentielle bornée et respect de `Retry-After`. Si ce dernier dépasse 30 s, la relance automatique est abandonnée plutôt que d'envoyer trop tôt. Les mutations restent sans relance automatique. |
| Temps réel | Les rafales sont regroupées et vidées au plus tard après une seconde. Si plusieurs changements distincts arrivent, une revalidation cohérente remplace la conservation du seul dernier fragment. Les invalidations de plusieurs observateurs sont fusionnées pendant 60 ms, avec suppression des sous-périmètres déjà couverts. Une relecture partagée en cours n'est pas annulée puis redémarrée. |
| Projections | Les projections serveur sont relues par défaut. Les patchs locaux exigent une option explicite et restent interdits pour les objets portant disponibilité, parcours ou travail. Le calendrier et les listes du dashboard ne sont plus reconstruits depuis un simple statut SSE. Les messages portant un état complet, comme la progression VF, peuvent toujours être appliqués. |
| Hors ligne | La session est vérifiée avant restauration du cache d'un compte. Lors d'une panne réseau, les seules métadonnées du dernier compte vérifié permettent de conserver sa consultation hors ligne. Un 401/403 ou une déconnexion confirmée purge ces métadonnées. Les compartiments IndexedDB restent distincts par compte. |
| Changement de compte | Une génération invalide les restaurations et écritures retardées. La purge attend les écritures déjà engagées, supprime les compartiments persistés, vide les caches de données et efface les affiches. Une ancienne restauration ne peut pas réinjecter ses données après une nouvelle connexion. |
| Première visite | Après activation du service worker, la coquille HTML authentifiée est préparée explicitement. La première page, chargée avant que le worker la contrôle, peut ainsi être rouverte hors ligne sans imposer une seconde navigation en ligne. Les pages publiques et destinations externes sont refusées pour cette préparation. |

Le retour sur une fiche garde sa revalidation, ses données déjà connues et son
chargement en arrière-plan. Les changements de source continuent à changer la clé
de requête. Si une revalidation échoue, le dernier contenu réussi reste conservé
hors ligne avec sa date d'origine, sans persister l'erreur et en imposant une
revalidation au retour du réseau. Les erreurs de chargement ne sont pas transformées en succès vide pour
les dossiers de demande : leur annulation et leurs erreurs restent reconnaissables.

## Budgets de rétention

Les tailles sont des **équivalents JSON UTF-8**, pas une mesure du tas JavaScript.

| Cache | Budget |
|---|---|
| TanStack ordinaire | Collecte après 5 min sans observateur ; 1 min pour téléchargements, activité/direct, santé et journaux. |
| Domaines autorisés hors ligne | Conservation jusqu'à 24 h, sous les plafonds de variantes et de taille. |
| Données inactives TanStack | 120 requêtes et 24 MiB au total ; 24 variantes par domaine, 40 pour les fiches média. Les plus récentes sont prioritaires. |
| Pages infinies inactives | Trois premières pages et leurs paramètres conservés ; la suite se recharge au retour. |
| Instantané IndexedDB | 8 MiB, 60 requêtes ; 12 variantes par domaine, 20 fiches média ; trois pages par requête infinie et 1 MiB par entrée. |
| SWR manuel en mémoire | 4 MiB, 48 entrées, six variantes par domaine, 512 KiB par entrée, durée maximale de 6 h. |
| SWR manuel dans `sessionStorage` | 2 MiB et 24 entrées. Bibliothèque, découverte, calendrier, médias, demandes, activité et stockage restent en mémoire seule pour éviter les copies supplémentaires. |

Les requêtes observées ou en cours ne sont pas évincées : supprimer des données
affichées casserait la sélection et le défilement. Les budgets TanStack portent
donc sur la rétention et les variantes inactives, avec une exception pour les
lectures actives. Une liste active très longue reste un chantier du lot 6,
notamment pour son rendu et les copies cumulatives.

La liste blanche IndexedDB reste inchangée : bibliothèque, analytique de
bibliothèque, découverte, demandes, calendrier, médias, problèmes et notifications.
Les réglages, comptes, journaux et mutations n'y sont pas ajoutés. Les anciennes
entrées et pages sont aussi bornées à la restauration ; les anciens instantanés
SWR en session sont nettoyés au chargement.

## Vérification et reproduction

Les tests couvrent notamment :

- expiration pendant les en-têtes et pendant le corps, annulation volontaire,
  suppression des temporisations et surcharge des en-têtes ;
- codes permanents, relances transitoires et délais `Retry-After` ;
- annulation du transport lorsque le dernier observateur quitte une fiche, et
  rejet de résultats tardifs après fermeture ou changement de cible ;
- regroupement de cinquante invalidations en une relecture de domaine, absence de
  perte des changements distincts et vidage d'un flux continu ;
- plafonds de variantes, protection d'une requête affichée, pages inactives bornées,
  absence de copie persistée SWR et stockage navigateur indisponible ;
- restauration retardée d'Alice pendant une connexion de Bob, vérification de
  session avant hydratation, écritures engagées pendant la purge et exclusion
  des mutations et réglages ;
- préparation de la coquille à la première installation et refus des documents
  publics ou externes.

Le protocole navigateur est `scripts/performance/offline.mjs` sur le profil
`history` du laboratoire, avec `WATCHDECK_PERF_RESULTS` positionné vers `lot5`.
La référence du lot 0 reste conservée séparément. Les fichiers de cette campagne
se trouvent dans [lot5](lot5/).

## Résultats vérifiés

- **Suite complète : 232 fichiers, 1 365 tests réussis** ; les contrôles ciblés
  finaux de réseau et de concurrence comptent ensuite **23 réussites**, dont la
  lecture manuelle d'une fiche annulée à sa fermeture. Les derniers contrôles de
  persistance, y compris la conservation après revalidation échouée, comptent
  **18 réussites**.
- TypeScript et build de production passent. Les avertissements du build sur les
  imports dynamiques déjà partagés ne sont pas traités comme des gains du lot 5.
- Test navigateur réel : la première réouverture hors ligne affiche **200 cartes**
  en **424 ms**. Le même scénario du lot 0 échouait avec `net::ERR_FAILED` avant
  la seconde navigation en ligne. Après navigation contrôlée, la réouverture
  hors ligne fonctionne également ; le second relevé inclut une attente de
  vérification d'une seconde et ne se compare pas directement au premier.
- La première vue conserve **240 099 octets et cinq requêtes** dans IndexedDB.
  Ce volume est proche de la référence : ce lot ne revendique pas une compression
  du contenu d'une page.
- Après **36 filtres différents dans la même SPA**, les derniers relevés restent
  à **38 requêtes** au total. Le dernier comprend 14 requêtes observées ou en cours,
  et 20 variantes inactives de bibliothèque. Le volume JSON des données reste
  autour de **1,6 à 1,7 Mo** sur les derniers relevés.
- L'instantané persistant termine à **738 454 octets, douze requêtes**, avec
  **zéro instantané SWR dans `sessionStorage`**. Les assertions du scénario
  navigateur vérifient les plafonds en distinguant les données actives protégées.

Ces parcours sont des mesures de laboratoire sur le profil de 50 000 médias et
200 000 lectures. Les plafonds de JSON ne prétendent pas mesurer le tas JavaScript
ni garantir une latence sur tous les appareils. Les données des fichiers de
résultats, les contrôles et les paramètres sont conservés dans `lot5/`.

## Suite du plan

Les lots **0 à 5** sont implémentés et vérifiés en laboratoire. Il reste :

- **Lot 6** : poids initial des icônes et styles, grandes listes et tableaux,
  copies cumulatives et cache d'affiches du service worker.
- **Lot 7** : processus API, budget PostgreSQL, concurrence et files de jobs,
  observation en déploiement et procédure de retour arrière.

Le déploiement de ce lot nécessite de reconstruire le frontend et de servir le
nouveau `sw.js`. Le toast habituel de mise à jour invite les onglets déjà ouverts
à recharger. Le push n'est pas présenté comme une mesure de production.
