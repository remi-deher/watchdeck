# Finalisation Plex des déplacements

La copie et le suivi Plex ont deux files indépendantes dans le moteur. Les titres
`plex_pending` et `cleaning`, leurs références Plex et leurs preuves sont conservés
en PostgreSQL : aucune nouvelle soumission de déplacement Arr ou copie n'est
nécessaire pour les finaliser après redémarrage.

Le moteur demande un scan ciblé du dossier destination, contrôle Plex toutes les
30 secondes et espace les demandes de scan du même dossier de cinq minutes.
Les horodatages sont persistants. Les opérations sur les fichiers sont sérialisées
avec la copie et l'annulation ; les demandes de scan peuvent continuer pendant
une copie. Une tâche dont seuls les contrôles Plex restent en attente est affichée
« Finalisation Plex », avec le nombre de titres et le volume encore conservé.

Pour rsync, aucune suppression n'a lieu avant confirmation de tous les fichiers
sur les mêmes identifiants de fiches Plex, contrôle Arr et vérification de
l'intégrité. La lecture est contrôlée à nouveau après la vérification, juste avant
le nettoyage. Une intention de nettoyage et les signatures destination sont
enregistrées avant suppression. Une pause, un arrêt, une annulation ou la perte du
verrou empêchent de poursuivre. Les scans source sont ensuite regroupés et
réessayés en arrière-plan. La fenêtre entre le dernier contrôle de lecture et
la suppression ne constitue pas un verrou sur Plex.

En mode API Arr, le déplacement reste exécuté par Arr : l'application ne maîtrise
pas la suppression de l'original par Arr. Seule la confirmation Plex est découplée.

Les nouveaux fichiers rsync gardent les dates de la source, mais utilisent la
politique d'accès de leur destination plutôt que les permissions/ACL de la source.
Pour une nouvelle destination, les bits de lecture/écriture du dossier parent sont
utilisés ; pour un fichier existant, ses permissions sont conservées. Les ACL
source ne sont pas importées. Les ACL par défaut et les identités des services du
stockage destination doivent autoriser Plex à lire les fichiers.
