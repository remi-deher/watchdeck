/* Phrases de decision de Plex (journaux de debogage) traduites en francais clair.

   Plex ne documente pas ces phrases et les formule en anglais technique. On traduit
   celles qu'on connait ; une phrase inconnue reste en anglais plutot que d'etre
   paraphrasee au hasard -- l'original est de toute facon affiche a cote. */

const PATTERNS: Array<[RegExp, (...groups: string[]) => string]> = [
  [/^App cannot direct play this item\. Direct play is disabled\.?$/i, () => 'Le lecteur a désactivé la lecture directe'],
  [/^Not enough bandwidth for direct play of this item\.?$/i, () => 'Débit insuffisant pour la lecture directe'],
  [/^Direct play not available; Conversion OK\.?$/i, () => 'Lecture directe impossible : conversion acceptée'],
  [/^Direct play OK\.?$/i, () => 'Lecture directe possible'],
  [/^Direct Play is disabled$/i, () => 'Lecture directe désactivée par le lecteur'],
  [/^media must be transcoded in order to use the (\w+) protocol$/i, (p) => `Le protocole ${p.toUpperCase()} impose une conversion`],
  [/^no direct play (?:video|audio) profile exists for (.+)$/i, (what) => `Aucun profil de lecture directe pour ${what}`],
  [/^Direct Streaming is disabled, so video stream will be transcoded$/i, () => 'Conversion légère désactivée : la vidéo est réencodée'],
  [/^Audio Direct Streaming is disabled, so video's audio stream will be transcoded$/i, () => 'Conversion légère de l’audio désactivée : l’audio est réencodé'],
  [/^Cannot direct stream video stream due to profile or setting limitations$/i, () => 'Vidéo incompatible avec le profil ou les réglages du lecteur'],
  [/^Cannot direct stream audio stream due to profile or setting limitations$/i, () => 'Audio incompatible avec le profil ou les réglages du lecteur'],
  [/^audio\.channels limitation applies: (\d+) > (\d+)\.?$/i, (have, max) => `Trop de canaux audio pour le lecteur (${have} > ${max})`],
  [/^video\.bitrate limitation applies: (\d+) > (\d+)\.?$/i, (have, max) => `Débit vidéo trop élevé pour le lecteur (${have} > ${max} kb/s)`],
  [/^video\.height limitation applies: (\d+) > (\d+)\.?$/i, (have, max) => `Résolution trop élevée pour le lecteur (${have}p > ${max}p)`],
];

/** Traduit une phrase de Plex ; `null` si elle est inconnue. */
export function translatePlexPhrase(text: string | null | undefined): string | null {
  const value = String(text || '').trim();
  if (!value) return null;
  // « This app cannot play this item. The reason is: <raison> » : on traduit la raison.
  const reason = value.match(/^This app cannot play this item\. The reason is: (.+)$/i);
  if (reason) {
    const inner = translatePlexPhrase(reason[1]);
    return `Le lecteur ne peut pas lire ce fichier : ${inner ? inner.charAt(0).toLowerCase() + inner.slice(1) : reason[1]}`;
  }
  for (const [pattern, render] of PATTERNS) {
    const match = value.match(pattern);
    if (match) return render(...match.slice(1));
  }
  return null;
}

/** Phrase a afficher : la traduction si on la connait, sinon l'original. */
export function plexPhrase(text: string | null | undefined): string {
  return translatePlexPhrase(text) ?? String(text || '');
}
