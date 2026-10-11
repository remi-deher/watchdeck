import { describe, expect, it } from 'vitest';
import { settingsPatchSchema } from './settingsSchema';

describe('settingsPatchSchema', () => {
  it('accepte « conserver indéfiniment » pour la rétention de l’historique (null)', () => {
    expect(settingsPatchSchema.safeParse({ activity_retention_days: null }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ activity_retention_days: 365 }).success).toBe(true);
  });

  it('refuse toujours une durée hors bornes', () => {
    expect(settingsPatchSchema.safeParse({ activity_retention_days: 0 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ activity_retention_days: 4000 }).success).toBe(false);
  });
});
