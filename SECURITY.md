# Politique de sécurité

## Versions supportées

Watchdeck est distribué via une seule ligne de release (tags `vMAJOR.MINOR.PATCH`,
image Docker `latest`). Seule la dernière version publiée reçoit des correctifs
de sécurité — il n'y a pas de maintenance de versions antérieures.

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour un problème de sécurité.

Utilisez plutôt l'onglet [Security > Report a vulnerability](https://github.com/remi-deher/watchdeck/security/advisories/new)
du dépôt, qui ouvre un rapport privé visible uniquement du mainteneur.

Merci d'inclure autant que possible :
- une description du problème et de son impact potentiel ;
- les étapes pour le reproduire ;
- la version ou le commit concerné (visible dans Paramètres > Système).

## Délai de réponse

Ce projet est maintenu par une seule personne sur son temps libre : compte sur
un accusé de réception sous quelques jours, sans garantie de délai fixe pour le
correctif. Les vulnérabilités critiques touchant les identifiants Plex/*arr ou
l'authentification sont traitées en priorité.
