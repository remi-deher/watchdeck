/* Libelles partages par la file, l'historique et les derniers elements termines. */

export function historyModeLabel(row: any): string {
  return row.processing_mode === 'automatic' ? 'Automatique' : row.processing_mode === 'manual' ? 'Import manuel' : 'Détecté par Watchdeck';
}

export function historyModeClass(row: any): string {
  return row.processing_mode === 'automatic' ? 'available' : row.processing_mode === 'manual' ? 'pending' : '';
}

/** Qualite annoncee par *arr, sinon devinee depuis le nom de la release. */
export function extractQuality(row: any): string {
  const quality = row?.quality;
  const explicit = typeof quality === 'string'
    ? quality
    : quality?.quality?.name || quality?.name || row?.quality_label || row?.quality_name;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const match = String(row?.title || '').match(/\b(2160p|1080p|720p|576p|480p|4k|uhd)\b/i);
  return match?.[1]?.toUpperCase() || '';
}
