# Travaux en cours

Le serveur fournit `work: WorkRef` pour les fichiers FileFlows, ses runners,
les files Sonarr/Radarr, les clients torrent, les téléchargements directs et
les transferts de stockage (y compris leur télémétrie légère).
Le contrat TypeScript est généré depuis OpenAPI par
`python -m scripts.generate_availability_types`.

Un travail porte une identité, sa source, son état observé, son étape, la cause
éventuelle et une progression dont la portée est explicite. Une mesure inconnue
est `null`, une mesure de zéro reste zéro. Un pourcentage ne certifie jamais
l’achèvement du travail : une étape FileFlows, un téléchargement avant import ou
une copie avant finalisation Plex peuvent atteindre 100 %.

L’attente automatique d’un verrou de disque n’est pas une intervention humaine.
La consigne `desired_state` d’un transfert ne remplace pas l’état observé.
Une observation torrent périmée porte `stale: true`, un état inconnu et aucune
progression courante. Les médias associés passent par `media_ref`, avec affiche
et fond.

`TrackTemplate`, ses cartes et sa file, ainsi que `LiveStrip`, reçoivent le travail
entier. Leur adaptation de présentation est commune dans `workPresentation`.
Les anciennes props restent compatibles ; les images explicites priment sur
celles de `media`. Les actions sont conservées selon leur contexte et leurs
permissions existantes ; le bandeau les transmet sans imbriquer des boutons.

Les événements partiels invalident les réponses contenant `work` pour relire la
projection serveur. La télémétrie stockage conserve son assemblage par identifiant
de tâche et d’élément : elle actualise `work` sans écraser les médias, snapshots
ou présentations connus. Aucun accès distant supplémentaire n’est ajouté à cette
route légère.

Les identifiants FileFlows de fichiers et de runners restent distincts : le
fournisseur expose un UID pour les fichiers et seulement un chemin pour les
runners. L’interface ne prétend pas connaître une correspondance non observée.

Les lectures Plex gardent leur contrat métier propre (session, personne, client,
mode de lecture). Les tâches planifiées et scans ne sont pas encore intégrés à
ce contrat de travaux médias.
