/**
 * Traduction des echecs reseau en phrases lisibles.
 *
 * Jusqu'ici l'interface affichait telle quelle la chaine levee par `fetch` ou par
 * FastAPI : l'utilisateur lisait « Failed to fetch » ou « HTTP 500 », c'est-a-dire le
 * vocabulaire du transport et non celui de la situation. Le detail renvoye par le
 * backend reste prioritaire quand il existe -- il est deja redige en francais et decrit
 * le cas precis ; ces libelles ne servent que de repli.
 */

const STATUS_MESSAGES: Record<number, string> = {
  400: 'La demande a été refusée : certaines informations sont incomplètes ou invalides.',
  401: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  403: "Vous n'avez pas les droits nécessaires pour cette action.",
  404: "Cet élément n'existe plus, ou l'adresse a changé.",
  409: 'Cette action entre en conflit avec une opération déjà en cours.',
  413: 'Le fichier envoyé est trop volumineux.',
  422: 'Certaines informations saisies ne sont pas valides.',
  429: 'Trop de requêtes en peu de temps. Patientez un instant avant de réessayer.',
  500: 'Le serveur a rencontré une erreur interne. Réessayez dans un instant.',
  502: "Le serveur n'a pas pu joindre un service externe (Plex, Sonarr, Radarr…).",
  503: 'Le service est momentanément indisponible. Réessayez dans un instant.',
  504: "Le service externe n'a pas répondu à temps.",
};

/** Message affichable pour un code HTTP, quel qu'il soit. */
export function messageForStatus(status: number): string {
  const known = STATUS_MESSAGES[status];
  if (known) return known;
  if (status >= 500) return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
  if (status >= 400) return "La demande n'a pas pu aboutir.";
  return `Réponse inattendue du serveur (${status}).`;
}

/* `fetch` echoue avec un `TypeError` dont le texte depend du navigateur : « Failed to
   fetch » sur Chromium, « NetworkError when attempting to fetch resource » sur Firefox,
   « Load failed » sur Safari. Aucun n'est montrable. */
const NETWORK_FAILURES = [
  'failed to fetch',
  'networkerror',
  'load failed',
  'network request failed',
  'the internet connection appears to be offline',
];

/**
 * Message affichable pour n'importe quelle erreur remontee par la couche API.
 * Une chaine deja redigee (le `detail` du backend) traverse sans modification.
 */
export function humanizeError(error: unknown): string {
  if (!error) return "Une erreur inattendue s'est produite.";
  const raw = typeof error === 'string' ? error : (error as any)?.message || String(error);
  const lowered = String(raw).toLowerCase();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Vous semblez hors ligne. Vérifiez votre connexion, puis réessayez.';
  }
  if (NETWORK_FAILURES.some((needle) => lowered.includes(needle))) {
    return "Le serveur n'a pas répondu. Vérifiez votre connexion, puis réessayez.";
  }
  if (lowered.includes('aborted') || lowered === 'aborterror') {
    return 'Requête interrompue.';
  }

  // « HTTP 503 » : produit par `api()` quand le backend n'a envoye aucun detail.
  const httpOnly = /^https?\s*(\d{3})$|^http\s(\d{3})$/i.exec(String(raw).trim());
  if (httpOnly) return messageForStatus(Number(httpOnly[1] || httpOnly[2]));

  return String(raw);
}
