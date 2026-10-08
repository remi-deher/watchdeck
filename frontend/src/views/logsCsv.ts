/* Export CSV des journaux, tels qu'affichés : séparateur « ; » et BOM pour qu'Excel en
 * français ouvre le fichier sans assistant d'import. */

export interface LogCsvRow {
  date: string;
  source: string;
  title: string;
  detail: string;
  result: string;
}

function cell(value: string): string {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function logsToCsv(rows: LogCsvRow[]): string {
  const header = ['Date', 'Source', 'Titre', 'Détail', 'Résultat'];
  const lines = [header, ...rows.map((row) => [row.date, row.source, row.title, row.detail, row.result])];
  return `﻿${lines.map((line) => line.map(cell).join(';')).join('\r\n')}`;
}
