"""Render the lot-0 report from saved measurements; fail on missing or invalid runs."""

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "docs/performance-results"
D = BASE / "lot0"


def load(name):
    return json.loads((D / name).read_text())


def med(values):
    return round(statistics.median(values), 1)


def ms(value):
    return f"{value:.1f}"


profiles = ["small", "large", "history"]
http = {p: load(p + "-http.json") for p in profiles}
sets = {p: load(p + "-dataset.json") for p in profiles}
workers = {p: load(p + "-arq.json") for p in profiles}
for p in profiles:
    assert sets[p]["verified_counts"]["library_items"] == sets[p]["library_items"]
    assert sets[p]["verified_counts"]["playback_sessions"] == sets[p]["playback_sessions"]
    assert workers[p]["refresh_ms"]["n"] == 3
browser = {p: load(p + "-browser.json") for p in ["small", "large"]}
for p, runs in browser.items():
    assert len(runs) == 6
    assert all(not r["errors"] and not r["failures"] and r["cold"]["renderedCards"] > 0 for r in runs), p
faults = load("failures.json")
assert faults["redis_multiprocess"]["computations"] == 1
assert faults["hard_expired"]["computations"] == 1 and faults["hard_expired"]["recomputed"]
assert faults["recovery"]["redis_value"] and faults["failed_arr"]["stale_preserved"]
lines = [
    "# Lot 0 — référence de performance mesurée",
    "",
    "Date : 28 octobre 2026. État : campagne de laboratoire terminée sur le code après le lot 1.",
    "",
    "## Conditions et portée",
    "",
    "Les API FastAPI et le build Vue de production ont été mesurés sur PostgreSQL réel, dans une base dédiée. "
    "Les fixtures sont déterministes et synthétiques : elles donnent une référence reproductible à trois échelles, "
    "sans prétendre reproduire les volumes ou la distribution d’une installation de production.",
    "",
    "Le serveur API utilise un processus et les pools par défaut, sans Redis pour les mesures HTTP. "
    "Les p50/p95 HTTP viennent de 20 appels séquentiels par route, puis de 40 appels mixtes par vagues de 8. "
    "Le premier appel est conservé séparément : le cache masque certains calculs très longs. "
    "Les tampons PostgreSQL et le disque ne sont pas vidés ; « premier appel » désigne le processus applicatif, pas un disque froid.",
    "",
    "Le conteneur PostgreSQL de test utilise tmpfs, `fsync=off`, `synchronous_commit=off` et `full_page_writes=off`. "
    "Le schéma vient des modèles ORM. Ce protocole favorise les écritures et ne mesure ni les migrations ni les performances d’un disque de production. "
    "La limite de l’environnement est de 2 CPU et 8 Gio. Versions et empreintes : [environment.json](lot0/environment.json).",
    "",
    "L’instrumentation locale ajoute une sonde de boucle événementielle et d’acquisition de connexion environ toutes les 50 ms. "
    "Le temps d’acquisition inclut l’ordonnancement et la vérification de connexion ; il ne constitue pas une mesure isolée d’attente du pool. "
    "Le maximum de connexions est un maximum observé par échantillonnage. RSS désigne la mémoire résidente ; le heap navigateur est distinct.",
    "",
    "## Jeux de données",
    "",
    "| Profil | Médias | Demandes | Lectures | Comptes | Instantané initial (Mio) |",
    "|---|---:|---:|---:|---:|---:|",
]
for p in profiles:
    d = sets[p]
    lines.append(
        f"| {p} | {d['library_items']} | {d['requests']} | {d['playback_sessions']} | {d['users']} | {d['snapshot_bytes'] / 1048576:.2f} |"
    )
lines += [
    "",
    "Les dates sont ancrées au 1er octobre 2026 à 12 h UTC, les lectures réparties minute par minute vers le passé. "
    "Les titres, codecs, utilisateurs et contenus sont générés ; aucune donnée personnelle réelle. "
    "Les images distantes ne sont pas renseignées : les mesures navigateur couvrent les données, le shell et les cartes, pas le téléchargement d’affiches Plex/TMDB. "
    "Le jeu initial contient un résumé analytique préparé ; les runs worker le reconstruisent ensuite depuis l’historique réel de la base.",
    "",
    "## API : p95 en millisecondes",
    "",
    "| Route / scénario | small | large | history |",
    "|---|---:|---:|---:|",
]
labels = {
    "library": "Bibliothèque, 200 éléments",
    "search": "Recherche `%0042%`",
    "deep": "Page éloignée (offset 800 / 49 800)",
    "analytics": "Analytique, 100 éléments triés",
    "summary": "Résumé analytique",
    "users": "Liste des comptes",
    "playback": "Historique paginé, 100 lectures",
    "playback_stats": "Statistiques d’activité (cache inclus)",
}
for k, label in labels.items():
    lines.append(
        "| " + label + " | " + " | ".join(ms(http[p]["results"][k]["http_ms"]["p95"]) for p in profiles) + " |"
    )
lines += [
    "",
    "## Premiers calculs et cache",
    "",
    "| Scénario | small, premier appel (ms) | large, premier appel (ms) | history, premier appel (ms) |",
    "|---|---:|---:|---:|",
]
for k in ["analytics", "playback_stats"]:
    lines.append("| " + labels[k] + " | " + " | ".join(ms(http[p]["results"][k]["first_ms"]) for p in profiles) + " |")
lines += [
    "",
    "Les requêtes de statistiques sont effectuées avec `days=3650`, borne longue volontaire pour inclure tout l’historique. "
    "Leur coût ne représente pas celui d’une période courte. Les lectures chaudes et le premier calcul doivent conserver deux budgets distincts.",
    "",
    "## Charge mixte et ressources API",
    "",
    "| Profil | p95 HTTP (ms) | Retard maximal boucle (ms) | Connexions observées | RSS au pic (Mio) | Acquisition connexion, p95 (ms) |",
    "|---|---:|---:|---:|---:|---:|",
]
for p in profiles:
    h = http[p]
    m = h["mixed"]
    lines.append(
        f"| {p} | {h['mixed_http_ms']['p95']:.1f} | {m['loop_lag_ms']['max']:.1f} | {m['pool_checkout_peak']} | {m['rss_peak_kib'] / 1024:.1f} | {m['pool_probe_ms'].get('p95', 0):.1f} |"
    )
lines += [
    "",
    "Le RSS au pic couvre la vie du processus, donc également les premiers calculs réalisés avant la charge mixte. "
    "Les JSON HTTP contiennent aussi, par route, les nombres de requêtes SQL, leurs durées, le volume de réponse décompressé et la mémoire courante.",
    "",
    "## Authentification concurrente",
    "",
    "| Profil | 4 connexions : maximum (ms) | Route indépendante : p95 (ms) | Retard boucle maximal (ms) |",
    "|---|---:|---:|---:|",
]
for p in profiles:
    a = http[p]["auth_load"]
    lines.append(
        f"| {p} | {a['login_ms']['max']:.1f} | {a['independent_route_ms']['p95']:.1f} | {a['loop_lag_ms'].get('max', 0):.1f} |"
    )
lines += [
    "",
    "## Plans SQL",
    "",
    "| Profil | Recherche (ms) | Première page (ms) | Page éloignée (ms) | Historique récent (ms) |",
    "|---|---:|---:|---:|---:|",
]
for p in profiles:
    plans = sets[p]["plans"]
    lines.append(
        "| "
        + p
        + " | "
        + " | ".join(ms(plans[k][0]["Execution Time"]) for k in ["search", "first_page", "deep_page", "history_recent"])
        + " |"
    )
lines += [
    "",
    "Une exécution `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` est conservée pour chaque cas dans les fichiers `*-dataset.json`. "
    "Ces durées SQL excluent transport HTTP, décodage ORM, sérialisation JSON et rendu navigateur. Elles ne sont pas des p95.",
    "",
    "## Worker ARQ réel",
    "",
    "| Profil | Recalcul médian (ms) | Maximum sur 3 jobs (ms) | RSS au pic (Mio) | Retard boucle maximal (ms) | Attente maximale en file (ms) |",
    "|---|---:|---:|---:|---:|---:|",
]
for p in profiles:
    w = workers[p]
    lines.append(
        f"| {p} | {w['refresh_ms']['p50']:.1f} | {w['refresh_ms']['max']:.1f} | {w['rss_peak_kib'] / 1024:.1f} | {w['loop_lag_ms']['max']:.1f} | {w['queue_wait_ms']['max']:.1f} |"
    )
lines += [
    "",
    "Trois jobs `job_library_analytics(force=True)` passent réellement par Redis et ARQ, avec un seul job simultané et sans cron. "
    "Le catalogue Plex est remplacé par une fixture de 100 ms : le chargement de l’historique, les agrégations, la persistance PostgreSQL, les états et les événements du job sont exécutés. "
    "Les latences Plex réelles et les contentions de 15 jobs ne sont pas simulées ici. Les fichiers `*-worker.json` isolent en complément le noyau de calcul sans ARQ.",
    "",
    "## Navigateur : bibliothèque",
    "",
    "Chromium headless utilise les vraies API, sans interception de réponse. Trois contextes neufs par profil et format. "
    "Le mobile est simulé en 390 × 844, CPU ralenti ×4, débit descendant 1,6 Mbit/s et latence CDP de 150 ms. "
    "Le bureau est en 1 440 × 900 sans ralentissement. Ces profils ne remplacent pas des appareils physiques.",
    "",
    "| Profil | Format | Contenu utile médian (ms) | LCP observé médian (ms) | Retour médian (ms) | Cartes rendues après défilement, max | DOM après défilement, max |",
    "|---|---:|---:|---:|---:|---:|---:|",
]
for p in ["small", "large"]:
    for mobile in [False, True]:
        r = [x for x in browser[p] if x["mobile"] == mobile]
        lines.append(
            f"| {p} | {'mobile' if mobile else 'bureau'} | {med([x['usefulMs'] for x in r])} | {med([x['cold']['lcp'] for x in r])} | {med([x['warmUsefulMs'] for x in r])} | {max(x['scroll']['renderedCards'] for x in r)} | {max(x['scroll']['domNodes'] for x in r)} |"
        )
lines += [
    "",
    "Le contenu utile est la première carte réellement visible, distincte du LCP du shell. "
    "Le retour est un rechargement de document avec les caches du même contexte, pas un clic SPA. "
    "Le test effectue 12 descentes ; il ne charge pas les 50 000 médias. Les ressources transmises, les tâches longues et le heap à chaque phase sont conservés dans les JSON. "
    "Les métriques réseau de phase sont cumulatives et aucune collecte forcée de mémoire n’est effectuée.",
    "",
    "## Réactivité et tableaux",
    "",
    "| Format | Interactions observées (> seuil Event Timing) | Candidat INP de la session (ms) |",
    "|---|---:|---:|",
]
for r in load("large-interactions.json"):
    lines.append(
        f"| {'mobile' if r['mobile'] else 'bureau'} | {r['observedInteractions']} | {r['labInpCandidateMs']} |"
    )
lines += [
    "",
    "Une session de recherche est instrumentée par format. Le candidat INP correspond au maximum des durées regroupées par interaction dans cette session courte. "
    "Il sert à détecter une lenteur à profiler ; il ne constitue pas l’INP terrain au 75e percentile des utilisateurs.",
    "",
    "| Tableau des comptes, profil history | Premier contenu utile (ms) | Lignes initiales | Lignes après 12 descentes | DOM initial | DOM final | Heap initial / final (Mio) |",
    "|---|---:|---:|---:|---:|---:|---:|",
]
for r in load("history-tables.json"):
    assert not r["errors"]
    a, b = r["initial"], r["afterScroll"]
    lines.append(
        f"| {'mobile' if r['mobile'] else 'bureau'} | {r['usefulMs']:.1f} | {a['rows']} | {b['rows']} | {a['domNodes']} | {b['domNodes']} | {a['heap']['usedSize'] / 1048576:.1f} / {b['heap']['usedSize'] / 1048576:.1f} |"
    )
offline = load("history-offline.json")
lines += [
    "",
    "## Stockage et reprise hors ligne",
    "",
    f"IndexedDB contient {offline['storage']['bytes']} octets et {offline['storage']['queries']} requêtes persistées. "
    f"La lecture directe prend {offline['storage']['readMs']:.2f} ms et le décodage JSON {offline['storage']['parseMs']:.2f} ms ; "
    "ce microtest est distinct du temps de remontage complet de l'application.",
    "",
    f"Après une première visite neuve : cartes disponibles hors ligne = {offline['offlineCardsVisible']}, "
    f"résultat observé : `{offline.get('error', 'succès')}`. "
    f"Après une navigation en ligne contrôlée par le service worker : cartes disponibles hors ligne = {offline['warmOffline']['cardsVisible']}, "
    f"{offline['warmOffline']['cards']} cartes en {offline['warmOffline']['reloadMs']:.1f} ms.",
    "",
    "La reprise après la toute première visite et la reprise avec le shell déjà en cache doivent donc être testées séparément. "
    "Ce point complète les travaux de persistance du lot 5 ; aucune correction du service worker n'a été faite pendant les mesures.",
]
lines += [
    "",
    "## Cache et dépendances lentes ou défaillantes",
    "",
    "| Scénario | Résultat |",
    "|---|---:|",
    f"| 20 requêtes sur cache Redis froid | {faults['redis_shared_cold']['computations']} calcul, {faults['redis_shared_cold']['total_ms']:.1f} ms au total, fixture de 250 ms |",
    f"| 4 processus distincts sur la même clé | {faults['redis_multiprocess']['computations']} calcul |",
    f"| TTL dur expiré, deux lecteurs concurrents | {faults['hard_expired']['computations']} recalcul, {faults['hard_expired']['total_ms']:.1f} ms au total |",
    f"| Valeur périmée disponible | Réponse en {faults['stale']['response_ms']:.2f} ms, ancienne valeur servie puis actualisée |",
    f"| Redis accepte la connexion mais reste silencieux | Repli initial en {faults['silent_redis']['first_fallback_ms']:.1f} ms ; appel suivant en {faults['silent_redis']['repeated_ms']:.2f} ms |",
    f"| Redis rétabli après la temporisation de 10 s | Reconnexion en {faults['recovery']['connection_ms']:.1f} ms, nouvelle valeur vérifiée dans Redis |",
    f"| 20 lectures d’un catalogue Arr lent (250 ms) | {faults['slow_arr']['upstream_calls']} appel amont, {faults['slow_arr']['total_ms']:.1f} ms au total |",
    f"| 20 lectures après erreur HTTP 503 Arr | {faults['failed_arr']['upstream_calls']} tentative amont, dernière valeur préservée |",
    "",
    "Le Redis utilisé est un conteneur jetable dédié. Les scénarios Arr et Redis silencieux utilisent des sockets TCP locales, pas des délais ajoutés aux API applicatives. "
    "Le test de coordination multiprocessus complète la validation locale du lot 1.",
    "",
    "## Conclusions et suite des corrections",
    "",
    "1. **Priorité au lot 3 :** la pagination analytique continue de payer le coût du catalogue entier. "
    "Les recalculs et leur mémoire augmentent fortement avec l’historique ; le worker peut bloquer sa propre boucle pendant plusieurs secondes.",
    "2. **Ajouter au lot 4 les statistiques d’activité à froid (PERF-40) :** le premier calcul de longue période est masqué par les réponses chaudes. "
    "Préparer les agrégats et limiter les lignes chargées ; conserver un budget séparé pour reconstruction et lecture.",
    "3. **Priorité frontend aux lots 5 et 6 :** le temps de première carte et les interactions mobiles restent à améliorer. "
    "La grille virtualisée reste bornée sur le parcours mesuré ; le tableau des comptes doit être suivi séparément.",
    "4. **Index et curseurs restent justifiés par la croissance :** les plans SQL de recherche et de page éloignée donnent maintenant une référence précise. "
    "La sonde du pool ne permet pas à elle seule de conclure à une saturation PostgreSQL ; comparer avec les blocages CPU.",
    "5. **Lot 1 confirmé sur les scénarios mesurés :** déduplication entre processus, service périmé rapide et reprise après panne réelle de Redis. "
    "Cela ne garantit pas l’exclusion entre processus pendant une partition réseau.",
    "",
    "## Reproduction et validation",
    "",
    "Voir [le protocole](../../scripts/performance/README.md) depuis la racine du dépôt (chemin `scripts/performance/README.md`). "
    "Les scripts, la version de base Git et les empreintes sont conservés avec les résultats. "
    "La campagne doit rester séquentielle pour éviter la concurrence des différents bancs de mesure.",
    "",
    "Le lot 0 est clôturé comme **référence de laboratoire**. Les mesures terrain, les images réelles, les appareils physiques, "
    "les distributions réelles des données et le dimensionnement de tous les crons restent des validations de déploiement. "
    "Aucune performance de production ni conformité générale aux seuils Core Web Vitals n’est revendiquée.",
    "",
]
# Relative link starts from docs/performance-results.
text = "\n".join(lines)
(BASE / "LOT0_MEASUREMENTS.md").write_text(text)
print("Report generated and result integrity checked.")
