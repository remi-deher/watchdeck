# Lot 6 — Ressources initiales et grandes collections

Date : 28 octobre 2026. Référence avant travaux : `8b64b0a` (lot 5).
Ce lot concerne les composants communs du frontend et le service worker, sans
migration SQL. Les lots 0 à 6 sont réalisés ; le lot 7 reste à exécuter.

## Corrections

| Périmètre | Correction |
|---|---|
| Tableaux communs | `UiDataTable` utilise TanStack Virtual au-delà de 150 lignes. Le DOM contient la fenêtre visible, six lignes de marge de chaque côté et la ligne portant le focus. Les petites listes gardent leur rendu complet. `ControlTable` et `ManageTemplate` transmettent une option de désactivation. |
| Interactions | Le tri et la sélection portent sur toutes les données chargées, y compris les lignes absentes du DOM. Les indices des événements restent ceux de la liste complète. Les touches Home/End et les flèches depuis une ligne permettent de changer de ligne ; Tab franchit les limites de la fenêtre virtuelle. Le focus reste monté pendant un défilement. |
| Hauteurs variables | Les groupes de lignes sont mesurés, y compris les détails contrôlés par `rowExpanded`. Les cartes mobiles utilisent les mêmes règles de présentation. Un détail sans état d'ouverture explicite désactive la virtualisation pour préserver ses widgets. La mesure suit les changements de largeur et le passage du seuil pendant le chargement progressif. |
| Styles | Les styles des cartes de tableau, de l'aperçu de courriel, des réglages du modèle et des menus Markdown suivent désormais leurs composants. Les règles communes restent globales ; les règles déplacées précèdent les styles locaux pour conserver leur priorité. Les variables de thème et les breakpoints communs sont conservés. |
| Grille bibliothèque | Les projections des médias sont réutilisées par identité d'objet ; une nouvelle page ajoute ses seuls nouveaux médias. Une relecture ou un changement de filtre reconstruit la liste nécessaire. Le suivi des cartes déjà apparues ne recopie plus tout son `Set` à chaque défilement. Une animation en attente est annulée au démontage. |
| Cache d'affiches | Les téléchargements restent parallèles, les écritures et évictions sont sérialisées. Un index de clés est relu toutes les 32 écritures au lieu d'après chaque image. L'éviction précède l'insertion pour respecter le plafond de 600, même en concurrence. Les revalidations ne comptent pas comme de nouvelles entrées. Une erreur de stockage ne fait pas perdre la réponse réseau. |

Le conteneur de défilement du tableau peut être la fenêtre ou un ancêtre déroulant.
Les espacements virtuels sont ignorés par les lecteurs d'écran ; le nombre et les
indices logiques des lignes sont exposés. Avec des détails additionnels, le total
ARIA reste inconnu plutôt que d'annoncer un total incorrect.

## Comparaison des icônes

Trois builds ont été comparés avant les autres changements. Chaque valeur est la
somme gzip niveau 9 des fichiers JS/CSS de l'entrée et des dépendances statiques de
la route. Les imports dynamiques ne sont pas inclus. Ce sont des budgets de build,
pas une mesure du temps réseau ni des en-têtes HTTP.

| Route | Bloc unique : octets gzip / fichiers | Automatique : octets gzip / fichiers | Commun + automatique : octets gzip / fichiers |
|---|---:|---:|---:|
| Connexion | 224 061 / 36 | 217 636 / 45 | 217 890 / 40 |
| Dashboard | 351 157 / 69 | 347 686 / 90 | 347 934 / 85 |
| Bibliothèque | 251 725 / 54 | 244 365 / 61 | 244 639 / 56 |
| Découverte | 284 100 / 67 | 278 510 / 81 | 278 747 / 76 |

**Décision : conserver le bloc unique par défaut.** Le gain des autres variantes
reste inférieur à 3 % du poids initial, pour 2 à 21 fichiers supplémentaires selon
la route. Sans mesure réseau démontrant un bénéfice, cela ne justifie pas de changer
le découpage. `WATCHDECK_ICON_SPLIT=auto|common|whole` permet de reproduire l'essai.
Les listes de dépendances sont conservées dans les fichiers JSON du dossier `lot6`.

## Budget final

| Route | Avant : gzip (octets) | Après : gzip (octets) | Fichiers avant / après | CSS brut avant / après (octets) |
|---|---:|---:|---:|---:|
| Connexion | 224 061 | 223 636 | 36 / 36 | 124 339 / 122 255 |
| Dashboard | 351 157 | 350 732 | 69 / 69 | 186 014 / 183 930 |
| Bibliothèque | 251 725 | 251 430 | 54 / 54 | 138 706 / 136 622 |
| Découverte | 284 100 | 283 679 | 67 / 67 | 157 467 / 155 383 |

La baisse est modeste et mesurée en octets : elle ne constitue pas une preuve de
réduction du LCP. Les graphiques et fiches ne sont pas ajoutés à l'entrée commune ; les graphiques
restent chargés avec les routes qui les utilisent, dont le dashboard.

## Mesures de grandes listes

Chromium local, build de production, API et PostgreSQL du laboratoire du lot 0.
La route Utilisateurs reçoit une **fixture de 2 000 comptes** pour isoler le rendu du
tableau : cette réponse API est interceptée volontairement. Les autres API restent
réelles. Ces mesures ne comparent donc pas la pagination serveur ni sa latence.
Aucune mutation de compte n'est envoyée.

| Vérification | Ordinateur 1440 × 900 | Mobile tactile 390 × 844 |
|---|---:|---:|
| Lignes rendues au premier relevé | 17 | 9 |
| Maximum sur sept positions de défilement | 28 | 17 |
| Sélection Maj-clic entre première et dernière ligne | 2 000 | 2 000 |
| Accès clavier End à l'indice 1999 | Réussi | Réussi |
| Débordement horizontal du document | Aucun | Aucun |
| Erreurs JavaScript | 0 | 0 |

Les nombres exacts peuvent varier avec les polices et les dimensions. Le test
reproductible exige au maximum 80 lignes rendues. Il vérifie également le maintien
du focus après défilement et le retour Home vers la première ligne.

Pour le cache, le test concurrent de 1 000 nouvelles affiches relève **32 scans**
contre 1 000 auparavant, soit **96,8 % de scans en moins** ; le maximum et la taille
finale restent à 600. Des tests distincts couvrent la revalidation, la purge externe
à la déconnexion et la reprise après erreur d'écriture. Il s'agit d'une mesure du
nombre d'opérations avec cache simulé, pas d'une durée CacheStorage sur téléphone.

## Validation et reproduction

- Suite complète : **233 fichiers, 1 373 tests réussis** (271,26 s).
- Vérifications ciblées finales : **24 tests** tableau/service worker réussis,
  plus **1 test** de pagination/revalidation des projections bibliothèque réussi.
  Ces vérifications incluent les derniers cas ajoutés après le départ de la suite complète.
- `vue-tsc --noEmit`, build de production et `git diff --check` : réussis.
- Chromium sur le build final : grande liste sur ordinateur et mobile, sélection
  tactile, sélection étendue, Tab/Maj+Tab, Home/End et focus conservé : réussis.
- Connexion, dashboard, bibliothèque et découverte : huit ouvertures réussies
  (ordinateur/mobile), sans erreur JavaScript ni asset manquant ni débordement
  horizontal. Résultats : `lot6/routes-smoke.json`.

Les données brutes de build et de navigateur sont dans le dossier `lot6`.
Le laboratoire ne configure pas TMDB : le contrôle de Découverte couvre son rendu
et ses états disponibles, pas les sections alimentées par ce service externe.
La virtualisation n'est pas une recherche sur les lignes non chargées : les filtres
et la pagination serveur des lots précédents gardent ce rôle.

```sh
npm run typecheck
npm run test:unit -- --maxWorkers=2
npm run build
node scripts/performance/bundle_routes.mjs final
# API du laboratoire démarrée sur 8765, données du lot 0 disponibles :
node scripts/performance/large_table.mjs
```

Pour les variantes, lancer le build avec `WATCHDECK_ICON_SPLIT=whole`, `auto` puis
`common`, puis `node scripts/performance/bundle_routes.mjs <variante>` après chaque
build. Refaire ensuite le build sans surcharge pour rétablir la stratégie retenue.

## Suite : lot 7

Restent le dimensionnement des processus et des pools PostgreSQL, la mesure des
jobs concurrents, la vérification des files/verrous et l'observation après déploiement.
Ces mesures exigent l'environnement cible et ses cycles de fond ; le laboratoire
local ne vaut pas validation de production.
