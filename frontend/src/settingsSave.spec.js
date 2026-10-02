/**
 * Enregistrement des réglages : n'envoyer que ce qui a changé.
 *
 * Les réglages sont désormais répartis sur plusieurs pages. Envoyer les cent trente-six
 * champs à chaque enregistrement faisait qu'une page réécrivait des réglages qu'elle
 * n'affiche même pas — et que deux administrateurs travaillant sur deux sections
 * différentes s'écrasaient l'un l'autre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api', () => ({ api: vi.fn() }));

const { api } = await import('@/api');
const { form, load, save, isDirty, changedFields, secretsPresent } = await import('./settingsForm');

const SERVER_STATE = {
  poll_interval_seconds: 300,
  vff_recheck_interval_minutes: 10,
  digest_hour: 8,
  plex_url: 'http://plex.local:32400',
  plex_token: 'jeton-existant',
};

async function chargerReglages() {
  api.mockResolvedValueOnce({ ...SERVER_STATE });
  await load();
}

describe('enregistrement des réglages', () => {
  beforeEach(async () => {
    vi.mocked(api).mockReset();
    await chargerReglages();
    // Le chargement est un appel comme un autre : on repart de zero pour n'observer
    // que ce que l'enregistrement envoie.
    vi.mocked(api).mockClear();
  });

  it('n’envoie rien quand rien n’a bougé', async () => {
    expect(isDirty.value).toBe(false);

    await save();

    expect(api).not.toHaveBeenCalled();
  });

  it('n’envoie que le champ modifié, pas tout le formulaire', async () => {
    form.vff_recheck_interval_minutes = 30;

    api.mockResolvedValueOnce({});
    await save();

    const [, options] = vi.mocked(api).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ vff_recheck_interval_minutes: 30 });
  });

  it('ne réécrit pas les réglages des autres pages', async () => {
    // Le cas concret : deux administrateurs, deux sections. Le second enregistrement
    // ne doit pas ramener sa copie périmée de ce que le premier vient de changer.
    form.digest_hour = 22;

    api.mockResolvedValueOnce({});
    await save();

    const envoye = JSON.parse(vi.mocked(api).mock.calls[0][1].body);
    expect(Object.keys(envoye)).toEqual(['digest_hour']);
    expect(envoye).not.toHaveProperty('poll_interval_seconds');
    expect(envoye).not.toHaveProperty('plex_url');
  });

  it('laisse un secret non saisi tranquille, et enregistre celui qu’on saisit', async () => {
    // Un champ secret vidé à l'affichage ne veut pas dire « efface la valeur ».
    expect(changedFields()).toEqual([]);

    form.plex_token = 'nouveau-jeton';
    api.mockResolvedValueOnce({});
    await save();

    expect(JSON.parse(vi.mocked(api).mock.calls[0][1].body)).toEqual({ plex_token: 'nouveau-jeton' });
    // Le champ se vide et l'interface signale qu'une valeur est configurée.
    expect(form.plex_token).toBe('');
    expect(secretsPresent.plex_token).toBe(true);
    expect(isDirty.value).toBe(false);
  });

  it('redevient propre après enregistrement, et le reste', async () => {
    form.poll_interval_seconds = 45;
    expect(isDirty.value).toBe(true);

    api.mockResolvedValueOnce({});
    await save();

    expect(isDirty.value).toBe(false);
    expect(changedFields()).toEqual([]);
  });

  it('garde les modifications en attente quand l’enregistrement échoue', async () => {
    form.poll_interval_seconds = 45;

    api.mockRejectedValueOnce(new Error('serveur indisponible'));
    await save();

    // Rien n'est perdu : la modification reste à enregistrer.
    expect(isDirty.value).toBe(true);
    expect(changedFields()).toEqual(['poll_interval_seconds']);
  });

  it('suit une modification faite sur une autre page avant l’enregistrement', async () => {
    // Le formulaire est partagé : une valeur changée ailleurs part avec le même bouton,
    // plutôt que d'être silencieusement abandonnée en quittant la page.
    form.vff_recheck_interval_minutes = 60;
    form.digest_hour = 6;

    api.mockResolvedValueOnce({});
    await save();

    expect(JSON.parse(vi.mocked(api).mock.calls[0][1].body)).toEqual({
      vff_recheck_interval_minutes: 60,
      digest_hour: 6,
    });
  });
});
