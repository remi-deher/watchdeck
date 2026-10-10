# Problèmes à traiter

`HandlingProblem` est une projection métier calculée par
`app/services/handling_problem.py` : identité stable (source, objet, type), état,
urgence, conséquence, proposition, caractère corrigeable et actions possibles.
Ses types TypeScript viennent des réponses OpenAPI réelles, via
`python -m scripts.generate_availability_types` (`--check` vérifie le contrat).

Un signalement utilisateur n'est pas un diagnostic : sa cause et la gravité réelle
de la lecture restent à vérifier. Une recherche *ARR exige une association valide ;
elle ne clôt jamais le signalement. Clore est une décision, réversible par Rouvrir.
Les notes restent enregistrées sur le signalement. Liste, création, modification
et fiche média servent le même objet et le média entier via `media_ref`.
Les médias sont résolus en lot, sans requête par ligne ; bibliothèque prioritaire,
demande en repli, association *ARR résolue indépendamment des images.
Une image manquante dans la bibliothèque garde le repli sur la demande liée.
Modifier un signalement invalide aussi les fiches média et les compteurs de
l'administration, sans leur recopier une réponse partielle.

Une demande produit un problème pour un échec, un retrait de *ARR ou une approbation
attendue. Une attente normale (envoi automatique, release, téléchargement, import,
indexation Plex) et un refus définitif n'en produisent pas. La fiche de demande
conserve ses permissions et ses actions propres.

Pour l'audit VF, aligner corrige une sélection de piste ; cela n'ajoute aucune piste
absente. Une VF partielle demande une recherche et n'est pas déclarée corrigeable
par alignement. Une correction invalide les projections du cache et les relit.
Les anciennes réponses sans projection restent compatibles durant la migration.

La page Problèmes compose PageTemplate et HandleTemplate ; le composable porte
les requêtes, mutations, notifications et adaptations d'affichage. HandleRow lit le
problème entier et le média, et conserve les anciens champs pour la galerie et les
anciens producteurs. Les notes constituent une capacité du bloc commun.

Les constats de santé des services et les problèmes de travaux en cours gardent
leurs contrats actuels ; ils ne sont pas fusionnés avec des signalements utilisateurs.
Le lot travaux en cours pourra produire le même contrat à partir de ses blocages.
