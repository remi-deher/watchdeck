# Disponibilité d’un média

`app/services/media_availability.py` produit le contrat partagé. Les champs historiques
restent disponibles pendant la migration ; `availability` prime dans les composants.

- `plex` : présence confirmée par un LibraryItem ou son lien, absence constatée par le
  rapprochement local, ou information inconnue. Un statut de demande disponible
  et un fichier Sonarr/Radarr ne suffisent pas à confirmer Plex.
- `episodes` : couverture des **fichiers ARR**, sur les épisodes déjà diffusés.
  Les épisodes futurs ne rendent pas une série partielle. Les compteurs inconnus
  restent `null`, ils ne sont jamais remplacés par zéro.
- `languages` : état analysé ; les données de la bibliothèque priment sur celles
  de la demande. `null` signifie non analysé, distinct de VF absente.
- `quality` : résolution observée lorsqu’elle est fournie ; sinon inconnue.
  Aucun appel réseau supplémentaire ni jugement de qualité n’est ajouté.

Les contrats de réponse de bibliothèque, de fiche et de liste compacte des demandes sont exposés par OpenAPI.
Avec `DATABASE_URL` configuré pour PostgreSQL :

```shell
python -m scripts.generate_availability_types
python -m scripts.generate_availability_types --check
```

Le fichier généré est commité. Le test serveur vérifie sa concordance avec OpenAPI.
Les champs de disponibilité sont obligatoires et les mesures absentes sont nullables.
Les autres champs des réponses restent extensibles pendant leur migration.
Le filtre « Dans Plex » impose ce rapprochement en SQL, avant la pagination.

Les fragments SSE et les corrections de pistes invalident les projections en cache :
le serveur recalcule leur état, le navigateur ne le reconstruit pas.
