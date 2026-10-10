# Parcours d'une demande

Le besoin est « où en est cette demande, pourquoi attend-elle et quelle est la
prochaine étape ? ». Le serveur produit `journey` dans la projection opérationnelle,
pour les listes, demandes détaillées, fiches média et objets annotés issus de TMDB.

`RequestJourney` contient l'identifiant de demande, l'origine réelle, l'état,
son libellé, les étapes datées, le blocage éventuel, la prochaine étape attendue,
le suivi et la disponibilité observée. Les champs sont obligatoires, même lorsque
leur valeur est inconnue (`null`). Les types TypeScript sont générés depuis les
contrats OpenAPI avec `python -m scripts.generate_availability_types` ; `--check`
vérifie leur actualité.

Un statut d'import terminé ne confirme pas Plex. Sans confirmation de bibliothèque,
le parcours attend Plex, même si l'ancien champ `status` annonce `available`.
L'origine *ARR ne fabrique ni demande ni approbation. Un refus termine le parcours,
une erreur expose sa cause et l'étape de reprise. Les épisodes futurs ne constituent
pas un blocage lorsqu'une série est à jour sur les fichiers déjà diffusés.

Les composants communs donnent la priorité à `journey`. Les anciens champs
opérationnels, `tracking`, `lifecycle` et les règles frontend restent des solutions
de compatibilité pour les réponses anciennes. Les événements partiels invalident
les listes projetées : le serveur recalcule le parcours complet.

La prochaine étape est une attente métier, pas une autorisation d'action : les
permissions et transitions restent contrôlées par les routes existantes. Le journal
et l'état des notifications restent distincts du parcours technique. La disponibilité
est celle connue par la synchronisation ; aucun appel réseau supplémentaire n'est
déclenché par la construction du parcours. Les médias sans demande conservent leur
historique de bibliothèque, sans création d'une fausse demande.
