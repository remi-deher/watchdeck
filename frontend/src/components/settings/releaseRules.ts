/* Règles de sélection des releases, côté écran : la phrase « En clair » et la lecture des
 * listes de mots. Le jugement d'une release se fait sur le serveur
 * (`POST /api/acquisition/release-check`), avec les règles réellement appliquées. */

export function splitKeywords(raw: string | null | undefined): string[] {
  return String(raw || '').split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
}

export function joinKeywords(words: string[]): string {
  return words.join(', ');
}

export interface RulesInput {
  required: string | null | undefined;
  forbidden: string | null | undefined;
  min: number | null | undefined;
  max: number | null | undefined;
  ratio: number | null | undefined;
  hours: number | null | undefined;
  deleteFiles: boolean;
  /** « films et séries », « films » ou « séries (par épisode) ». */
  scope: string;
}

const num = (value: number) => String(value).replace('.', ',');

/** La phrase qui résume ce que fait la recherche automatique avec ces règles. */
export function rulesSentence(input: RulesInput): string {
  const required = splitKeywords(input.required);
  const forbidden = splitKeywords(input.forbidden);
  const parts = [
    required.length ? `contient ${required.join(', ')}` : 'contient n’importe quel mot',
    forbidden.length ? `aucun de ${forbidden.join(', ')}` : '',
  ].filter(Boolean);
  const hasMin = typeof input.min === 'number';
  const hasMax = typeof input.max === 'number';
  const size = hasMin && hasMax
    ? `pèse entre ${num(input.min!)} et ${num(input.max!)} Go`
    : hasMin ? `pèse au moins ${num(input.min!)} Go` : hasMax ? `pèse au plus ${num(input.max!)} Go` : '';
  const kept = `Pour les ${input.scope}, une release est retenue si elle ${[...parts, size].filter(Boolean).join(', ')}.`;

  const hasRatio = typeof input.ratio === 'number';
  const hasHours = typeof input.hours === 'number';
  const limits = [hasRatio ? `à un ratio de ${num(input.ratio!)}` : '', hasHours ? `après ${input.hours} h de partage` : ''].filter(Boolean);
  const removed = limits.length
    ? `Elle est retirée du client ${limits.join(' ou ')}, ${input.deleteFiles ? 'fichiers compris' : 'fichiers conservés'}.`
    : 'Elle reste dans le client tant qu’on ne la retire pas.';
  return `${kept} ${removed}`;
}
