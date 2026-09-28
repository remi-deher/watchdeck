export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

/** Estimation indicative, affichee pendant la saisie ; seule la longueur minimale est exigee. */
export function passwordStrength(value: string): { score: number; level: PasswordStrengthLevel; label: string } {
  if (!value) return { score: 0, level: 'empty', label: 'Au moins 8 caractères requis' };
  let score = 0;
  if (value.length >= 8) score += 25;
  if (value.length >= 12) score += 15;
  if (/[A-Z]/.test(value)) score += 20;
  if (/[0-9]/.test(value)) score += 20;
  if (/[^A-Za-z0-9]/.test(value)) score += 20;
  score = Math.min(score, 100);
  if (score < 30) return { score, level: 'weak', label: 'Mot de passe trop faible' };
  if (score < 60) return { score, level: 'fair', label: 'Mot de passe moyen' };
  if (score < 80) return { score, level: 'good', label: 'Bon mot de passe' };
  return { score, level: 'strong', label: 'Mot de passe fort' };
}
