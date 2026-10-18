import { compareReleaseTitles } from '@/utils/releaseTitle';

/* Comparatif technique entre le fichier en place et une release candidate, et règles
   d'affichage d'une release dans la recherche *arr (VfUpgradeButton). Fonctions pures. */

export interface ReleaseComparison {
  current: any;
  candidate: any;
  warnings: string[];
}

/** Release rejetée par *arr (drapeau ou motifs). */
export function isRejected(release: any): boolean {
  return Boolean(release.rejected || release.rejections?.length);
}

/** Release téléchargeable : un torrent sans source n'est pas proposé. */
export function isPublished(release: any): boolean {
  return !(release.protocol === 'torrent' && !release.seeders);
}

/* Deux comparatifs se superposent, et celui du serveur fait autorité.
 *
 * Le comparatif client ne lit que les titres de release : il ignore donc le HDR connu
 * du seul `mediaInfo` de *arr et le score de custom format. Le serveur, lui, compare le
 * profil réel du fichier en place (voir services/vf_technical_guard.py) et c'est lui
 * qui refuse le grab. On affiche donc ses conclusions quand il en a, et on retombe sur
 * l'analyse des titres pour une release qu'il n'a pas annotée (ancienne suggestion
 * enregistrée avant cette version, ou recherche *arr classique hors mode VF). */
function serverComparison(release: any): any | null {
  return release?.vf_technical || null;
}
function technicalWarnings(release: any, currentTitles: string[]): string[] {
  const fromServer = release?.vf_technical_reasons || [];
  if (fromServer.length) return fromServer;
  if (serverComparison(release)) return [];
  return compareReleaseTitles(currentTitles, release.title).warnings;
}
function serverProfileSummary(profile: any): any {
  return {
    resolution: profile?.resolution ? `${profile.resolution}p` : null,
    hdr: (profile?.dynamic_range || []).includes('hdr'),
    dolbyVision: (profile?.dynamic_range || []).includes('dv'),
    source: profile?.quality || null,
    customFormatScore: profile?.custom_format_score,
  };
}

/** Comparatif actuel / candidate d'une release, et ses avertissements. */
export function releaseComparison(release: any, currentTitles: string[]): ReleaseComparison {
  const authoritative = serverComparison(release);
  if (authoritative) {
    return {
      current: serverProfileSummary(authoritative.current),
      candidate: serverProfileSummary(authoritative.candidate),
      warnings: technicalWarnings(release, currentTitles),
    };
  }
  const parsed = compareReleaseTitles(currentTitles, release.title);
  return { ...parsed, warnings: technicalWarnings(release, currentTitles) };
}

/** Résumé lisible d'un profil technique : « 2160p · Dolby Vision · x265 · WEB-DL ». */
export function technicalSummary(value: any): string {
  const entries = [
    value.resolution,
    value.dolbyVision ? 'Dolby Vision' : value.hdr ? 'HDR' : null,
    value.codec,
    ...(value.codecs || []),
    value.source,
    ...(value.sources || []),
  ];
  return [...new Set(entries.filter(Boolean))].join(' · ') || 'Marqueurs inconnus';
}
